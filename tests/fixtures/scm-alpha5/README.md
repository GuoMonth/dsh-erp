# Frozen SCM/USA alpha.5 baseline

These compiled JavaScript fixtures were captured from the alpha.5 source at `13cfeab3537add754a88efa21ae6e198b845bb6d` before production adapters were removed. Only module paths and the fixture header changed. They preserve historical behavior for developer regression tests, not a runtime adapter or preloaded knowledge.

No credentials, real business rows or saved user knowledge are included. `tests/scm-learning.test.mjs` supplies synthetic responses and independent assertions. Do not import this directory from src or include it in npm files. The generic path is tested separately with empty stores in `tests/adaptive-learning.test.mjs`.
