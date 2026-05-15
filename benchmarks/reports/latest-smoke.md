# prompt.lupinum benchmark report (smoke)

Generated: 2026-05-15T21:01:39.352Z
Fixture: 120 total files, 40 selected files
Fixture bytes: 860020 total, 285854 selected, largest file 7268, deepest path 8 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 1.28 | 1.43 | 1.02 | 1.43 | 4 |
| tree:selected | 0.15 | 0.21 | 0.12 | 0.21 | 4 |
| tree:full | 0.55 | 0.79 | 0.33 | 0.79 | 4 |
| context:selected-tree | 1.94 | 2.16 | 1.74 | 2.16 | 4 |
| context:full-tree | 12.23 | 33.96 | 1.87 | 33.96 | 4 |
| context:minified-full-tree | 2.65 | 3.31 | 2.26 | 3.31 | 4 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +0.22 | +20.67% | +0.27 | +22.97% |
| tree:selected | -0.00 | -2.11% | -0.03 | -11.50% |
| tree:full | +0.34 | +169.60% | +0.56 | +232.29% |
| context:selected-tree | -0.09 | -4.64% | -0.44 | -16.82% |
| context:full-tree | +10.34 | +547.15% | +31.77 | +1450.02% |
| context:minified-full-tree | +0.91 | +52.25% | +1.06 | +47.21% |
