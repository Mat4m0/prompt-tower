# Prompt Tower benchmark report (smoke)

Generated: 2026-04-13T20:31:53.937Z
Fixture: 120 total files, 40 selected files
Fixture bytes: 860020 total, 285854 selected, largest file 7268, deepest path 8 segments

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 1.40 | 1.61 | 1.29 | 1.61 | 4 |
| tree:selected | 0.15 | 0.21 | 0.12 | 0.21 | 4 |
| tree:full | 0.21 | 0.23 | 0.20 | 0.23 | 4 |
| tokens:legacy-full | 24.17 | 26.40 | 22.81 | 26.40 | 4 |
| tokens:selected | 8.56 | 9.02 | 7.99 | 9.02 | 4 |
| tokens:full | 23.31 | 23.68 | 22.62 | 23.68 | 4 |
| tokens:warm-full | 24.81 | 25.68 | 23.96 | 25.68 | 4 |
| context:selected-tree | 2.41 | 2.64 | 2.18 | 2.64 | 4 |
| context:full-tree | 2.33 | 2.71 | 2.13 | 2.71 | 4 |
| context:minified-full-tree | 2.00 | 2.30 | 1.77 | 2.30 | 4 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +0.17 | +13.92% | -0.05 | -3.17% |
| tree:selected | +0.07 | +101.72% | +0.09 | +69.52% |
| tree:full | +0.07 | +49.35% | +0.08 | +50.47% |
| tokens:legacy-full | +13.12 | +118.66% | +12.63 | +91.74% |
| tokens:selected | +5.55 | +184.05% | +5.69 | +171.05% |
| tokens:full | +14.31 | +158.95% | +13.43 | +131.00% |
| tokens:warm-full | +10.36 | +71.73% | +10.54 | +69.59% |
| context:selected-tree | +0.83 | +52.73% | +0.54 | +25.73% |
| context:full-tree | +0.80 | +52.25% | +1.12 | +70.43% |
