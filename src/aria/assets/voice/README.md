# Spoken names for the tracing game

Short clips that say each letter and number in the Trace game (`src/aria/trace/voice.ts`).

- **Voice:** Higgsfield `seed_audio` (Seed Audio 1.0), preset voice **Ainsley** (female).
  It is a built-in preset voice, not a copy of any real person's voice. Speech rate −10 (a little slower, for clarity).
- **Text:** the names in `LETTER_NAMES` (`src/aria/trace/glyphs.ts`), e.g. `A` → "ay", `W` → "double you"; numbers say their digits.
- **Made:** 2026-10-26, on the owner's Higgsfield account. Each clip is 0.1 credits.

## Files

- `letters/A.mp3` … `letters/Z.mp3` (capital letter names; lowercase uses the same clip)
- `numbers/1.mp3` … `numbers/100.mp3`

A missing clip is silent: the game works without it, and the voice button stays hidden until at least one clip is in the build.

## Where the clips are

Each clip is a Higgsfield job (the owner's account). Download each result and save it under the name above.

| Letter | Job | | Letter | Job |
|---|---|---|---|---|
| A | `6b2b4e1d-a41f-4601-bd82-5bf1e1d06f9a` | | N | `5096403b-5823-49d2-9997-8ab0994dd0d8` |
| B | `b275b2eb-e491-484e-88ba-ea8ae8229c0a` | | O | `3b70b8c6-bf8e-4b86-8ad7-8c9ec026c159` |
| C | `a5cab02d-d7a5-44b1-b2e9-b23762b715dd` | | P | `c6a0d1ed-7b94-4d45-a074-7e0000c471bd` |
| D | `2d98260d-26e1-4c6d-a582-f66ae7b10493` | | Q | `3dcfe0d3-8266-4706-8dbe-19113ba32c18` |
| E | `356dfdac-d311-47a1-b3ab-c378fa093197` | | R | `417d2513-4c99-4909-ae9c-16e5c07ff522` |
| F | `72de6300-9473-4733-ad8f-372d394a9714` | | S | `e364bf33-c547-4626-beca-bc9c2eb16b3d` |
| G | `104dcff2-e659-42a6-b45b-cf071e2903fc` | | T | `5ea87e6c-7de7-4d88-8eb1-7a3a5e6b6d7b` |
| H | `31f8268e-af3a-47b4-8ea5-b49e1216bda2` | | U | `08dc5b88-f4d1-42ab-b23b-68d5acb9cf94` |
| I | `db5c716f-1316-4748-8675-2a431a86714f` | | V | `c538b82b-648c-41ca-997f-e23f03c252ec` |
| J | `d9df417b-9db0-4ec8-b137-c7b6999ed767` | | W | `e7a8459b-b5b6-45f1-bcf5-b1b7bb4f22dc` |
| K | `21dc1e6d-0b43-4a6c-a696-d27d446497e9` | | X | `b3320a10-694d-4d85-880a-62d4b73fa793` |
| L | `1d4b05ea-6878-4055-bc02-158b9e60c4c0` | | Y | `aad4a486-394b-49e1-9e9e-f521313a149b` |
| M | `378fb7f2-f2aa-497f-bca8-3e57d22aff3f` | | Z | `21506e81-2f05-4ae6-9e1b-e2bb2b6060ae` |

Numbers made so far (number → job): 1 `a4beb267-305e-4442-a6f3-82c4831771dd`, 2 `7468a501-16a9-4592-a35c-231708e003be`, 3 `043082de-cd37-40e0-9270-4ba718edbdc6`, 4 `0832bfcf-d11e-4b58-9aaa-c1095bbf3e7c`, 5 `f29f47ad-0c0a-4ded-9389-c650d39c8fa7`, 6 `77c1b7ef-dae4-40af-addd-caec41fa86a8`, 7 `0b23e64f-12dd-41f4-9a26-6b4a493d69e8`, 8 `7086260c-62bf-4bbb-b41d-667657a050fe`, 9 `9b2acc9b-c60b-48c2-ab5f-e689793cbc9d`, 10 `3387c4d8-0a0a-4324-8550-ff748d434ba8`, 11 `19af8bf0-e541-4e06-8795-47813bf0e10f` (pending when made), 12 `163facd3-0c0d-401a-b290-d3be82428ec6`.

Numbers 13–100 are not made yet.

## Adding a clip

1. Download the Higgsfield result and save it as `letters/<LETTER>.mp3` or `numbers/<n>.mp3`.
2. Check it is clear at a slow speed, then run `npm run typecheck && npm run build`.
