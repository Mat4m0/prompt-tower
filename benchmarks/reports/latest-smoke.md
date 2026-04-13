# Prompt Tower benchmark report (smoke)

Generated: 2026-04-13T21:03:51.706Z
Fixture: 120 total files, 40 selected files
Fixture bytes: 860020 total, 285854 selected, largest file 7268, deepest path 8 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 1.53 | 1.63 | 1.40 | 1.63 | 4 |
| tree:selected | 0.17 | 0.22 | 0.13 | 0.22 | 4 |
| tree:full | 0.24 | 0.27 | 0.22 | 0.27 | 4 |
| tokens:legacy-full | 26.00 | 28.30 | 24.88 | 28.30 | 4 |
| tokens:selected | 9.54 | 9.99 | 8.75 | 9.99 | 4 |
| tokens:full | 24.78 | 25.08 | 24.50 | 25.08 | 4 |
| tokens:warm-full | 27.11 | 28.21 | 25.88 | 28.21 | 4 |
| tokens:delta-cached-subtree | 0.01 | 0.01 | 0.01 | 0.01 | 4 |
| tokens:delta-mixed-subtree | 0.01 | 0.02 | 0.01 | 0.02 | 4 |
| context:selected-tree | 2.24 | 3.09 | 1.92 | 3.09 | 4 |
| context:full-tree | 3.74 | 4.59 | 2.82 | 4.59 | 4 |
| context:minified-full-tree | 2.31 | 2.68 | 2.13 | 2.68 | 4 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +0.13 | +9.08% | +0.09 | +6.18% |
| tree:selected | +0.00 | +2.57% | -0.01 | -4.72% |
| tree:full | -0.01 | -2.39% | -0.03 | -10.48% |
| tokens:legacy-full | -0.19 | -0.73% | -0.56 | -1.95% |
| tokens:selected | -0.10 | -1.09% | -0.93 | -8.48% |
| tokens:full | -0.12 | -0.50% | -1.68 | -6.26% |
| tokens:warm-full | +0.67 | +2.52% | +0.12 | +0.42% |
| tokens:delta-cached-subtree | -9.31 | -99.85% | -9.55 | -99.85% |
| tokens:delta-mixed-subtree | -9.81 | -99.86% | -10.97 | -99.84% |
| context:selected-tree | +0.21 | +10.34% | +0.83 | +36.58% |
| context:full-tree | +1.63 | +77.32% | +2.17 | +89.87% |
| context:minified-full-tree | +0.59 | +34.24% | +0.76 | +39.74% |
