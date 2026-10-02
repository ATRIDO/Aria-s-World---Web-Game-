#!/bin/sh
# Builds the region labeler to WebAssembly and copies it next to the game code.
# Requires: rustup target add wasm32-unknown-unknown
set -e
cd "$(dirname "$0")/.."
cargo build --manifest-path crates/regions/Cargo.toml --release --target wasm32-unknown-unknown
cp crates/regions/target/wasm32-unknown-unknown/release/regions.wasm src/aria/wasm/regions.wasm
ls -l src/aria/wasm/regions.wasm
