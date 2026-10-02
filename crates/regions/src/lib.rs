//! Splits a line-art coloring page into fillable regions.
//!
//! Replaces Unity's `AutoRegionSlicer`: instead of one full-size mask texture
//! per region, it produces a single label map (one `u32` per pixel, 0 = not
//! paintable) that the renderer uses directly as a stencil.
//!
//! The wasm build exports a tiny C ABI (`alloc`, `dealloc`, `label_regions`)
//! so the JS side needs no wasm-bindgen glue.

use std::alloc::{self, Layout};

#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Pixels with r+g+b below this (0..=765) count as outline ink.
    pub dark_threshold: u32,
    /// Regions smaller than this many pixels are dropped and later absorbed
    /// by their neighbours during growth (anti-aliasing slivers, specks).
    pub min_region: u32,
    /// How many pixels each region grows into unlabeled pixels (outline ink
    /// included) so paint tucks under the line art with no white gaps.
    pub grow: u32,
}

impl Default for Params {
    fn default() -> Self {
        Params { dark_threshold: 268, min_region: 40, grow: 3 }
    }
}

/// Labels 4-connected regions of paintable pixels. Returns the labels
/// (row-major, top-left origin) and the number of regions; labels run 1..=count.
pub fn label(rgba: &[u8], width: usize, height: usize, p: Params) -> (Vec<u32>, u32) {
    let n = width * height;
    assert!(rgba.len() >= n * 4, "rgba buffer too small");

    let opaque = |i: usize| rgba[i * 4 + 3] > 0;
    let paintable: Vec<bool> = (0..n)
        .map(|i| {
            let s = rgba[i * 4] as u32 + rgba[i * 4 + 1] as u32 + rgba[i * 4 + 2] as u32;
            opaque(i) && s >= p.dark_threshold
        })
        .collect();

    // Connected components with an explicit stack.
    let mut labels = vec![0u32; n];
    let mut sizes: Vec<u32> = vec![0]; // index 0 unused
    let mut stack: Vec<u32> = Vec::new();
    for start in 0..n {
        if !paintable[start] || labels[start] != 0 {
            continue;
        }
        let id = sizes.len() as u32;
        let mut size = 0u32;
        labels[start] = id;
        stack.push(start as u32);
        while let Some(i) = stack.pop() {
            let i = i as usize;
            size += 1;
            let (x, y) = (i % width, i / width);
            let mut visit = |j: usize| {
                if paintable[j] && labels[j] == 0 {
                    labels[j] = id;
                    stack.push(j as u32);
                }
            };
            if x > 0 { visit(i - 1); }
            if x + 1 < width { visit(i + 1); }
            if y > 0 { visit(i - width); }
            if y + 1 < height { visit(i + width); }
        }
        sizes.push(size);
    }

    // Drop tiny regions and renumber the rest densely, in scan order.
    let mut remap = vec![0u32; sizes.len()];
    let mut count = 0u32;
    for (id, &size) in sizes.iter().enumerate().skip(1) {
        if size >= p.min_region {
            count += 1;
            remap[id] = count;
        }
    }
    for l in labels.iter_mut() {
        *l = remap[*l as usize];
    }

    // Grow regions into unlabeled (but not transparent) pixels, one ring per pass.
    let mut changes: Vec<(u32, u32)> = Vec::new();
    for _ in 0..p.grow {
        changes.clear();
        for i in 0..n {
            if labels[i] != 0 || !opaque(i) {
                continue;
            }
            let (x, y) = (i % width, i / width);
            let pick = [
                (x > 0).then(|| i - 1),
                (x + 1 < width).then(|| i + 1),
                (y > 0).then(|| i - width),
                (y + 1 < height).then(|| i + width),
            ]
            .into_iter()
            .flatten()
            .map(|j| labels[j])
            .find(|&l| l != 0);
            if let Some(l) = pick {
                changes.push((i as u32, l));
            }
        }
        if changes.is_empty() {
            break;
        }
        for &(i, l) in &changes {
            labels[i as usize] = l;
        }
    }

    (labels, count)
}

// ---------------------------------------------------------------------------
// C ABI for the browser
// ---------------------------------------------------------------------------

const ALIGN: usize = 8;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    unsafe { alloc::alloc(Layout::from_size_align_unchecked(len, ALIGN)) }
}

/// # Safety
/// `ptr` must come from `alloc(len)` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len != 0 {
        alloc::dealloc(ptr, Layout::from_size_align_unchecked(len, ALIGN));
    }
}

/// Reads `width*height` RGBA pixels at `rgba`, writes `width*height` u32
/// labels at `out`, returns the region count.
///
/// # Safety
/// Both pointers must be valid for the sizes above; `out` must be 4-byte aligned.
#[no_mangle]
pub unsafe extern "C" fn label_regions(
    rgba: *const u8,
    width: u32,
    height: u32,
    out: *mut u32,
    dark_threshold: u32,
    min_region: u32,
    grow: u32,
) -> u32 {
    let (w, h) = (width as usize, height as usize);
    let src = core::slice::from_raw_parts(rgba, w * h * 4);
    let (labels, count) = label(src, w, h, Params { dark_threshold, min_region, grow });
    core::ptr::copy_nonoverlapping(labels.as_ptr(), out, w * h);
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds an RGBA image from rows of chars: '.' white, '#' black ink, ' ' transparent.
    fn image(rows: &[&str]) -> (Vec<u8>, usize, usize) {
        let (w, h) = (rows[0].len(), rows.len());
        let mut px = Vec::with_capacity(w * h * 4);
        for r in rows {
            for c in r.chars() {
                px.extend_from_slice(match c {
                    '.' => &[255, 255, 255, 255],
                    '#' => &[0, 0, 0, 255],
                    ' ' => &[0, 0, 0, 0],
                    _ => panic!("bad char"),
                });
            }
        }
        (px, w, h)
    }

    const NO_FILTER: Params = Params { dark_threshold: 268, min_region: 1, grow: 0 };

    #[test]
    fn line_splits_page_into_two_regions() {
        let (px, w, h) = image(&["..#..", "..#..", "..#.."]);
        let (l, n) = label(&px, w, h, NO_FILTER);
        assert_eq!(n, 2);
        assert_eq!(l[0], 1);
        assert_eq!(l[2], 0, "ink is unlabeled without growth");
        assert_eq!(l[4], 2);
        assert_eq!(l[0], l[10], "same side shares a label");
    }

    #[test]
    fn closed_shape_interior_is_its_own_region() {
        let (px, w, h) = image(&[".....", ".###.", ".#.#.", ".###.", "....."]);
        let (l, n) = label(&px, w, h, NO_FILTER);
        assert_eq!(n, 2);
        assert_ne!(l[12], l[0]);
    }

    #[test]
    fn tiny_regions_are_dropped_then_absorbed_by_growth() {
        let (px, w, h) = image(&["......", ".###..", ".#.#..", ".###..", "......"]);
        let p = Params { min_region: 2, grow: 0, ..NO_FILTER };
        let (l, n) = label(&px, w, h, p);
        assert_eq!(n, 1);
        assert_eq!(l[2 * w + 2], 0, "1px hole dropped");

        let (l, _) = label(&px, w, h, Params { grow: 2, ..p });
        assert!(l.iter().all(|&v| v == 1), "growth covers ink and the hole");
    }

    #[test]
    fn growth_splits_a_line_between_its_neighbours() {
        let (px, w, h) = image(&["..##..", "..##..", "..##.."]);
        let (l, n) = label(&px, w, h, Params { grow: 1, ..NO_FILTER });
        assert_eq!(n, 2);
        assert_eq!(&l[0..6], &[1, 1, 1, 2, 2, 2]);
    }

    #[test]
    fn growth_never_enters_transparent_pixels() {
        let (px, w, h) = image(&["..  ", "..  "]);
        let (l, n) = label(&px, w, h, Params { grow: 3, ..NO_FILTER });
        assert_eq!(n, 1);
        assert_eq!(&l[0..4], &[1, 1, 0, 0]);
    }

    #[test]
    fn abi_round_trip() {
        let (px, w, h) = image(&["..#..", "..#.."]);
        let n = w * h;
        let inp = alloc(n * 4);
        let out = alloc(n * 4) as *mut u32;
        unsafe {
            core::ptr::copy_nonoverlapping(px.as_ptr(), inp, n * 4);
            let count = label_regions(inp, w as u32, h as u32, out, 268, 1, 0);
            assert_eq!(count, 2);
            assert_eq!(*out.add(4), 2);
            dealloc(inp, n * 4);
            dealloc(out as *mut u8, n * 4);
        }
    }
}
