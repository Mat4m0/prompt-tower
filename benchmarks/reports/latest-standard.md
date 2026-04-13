# Prompt Tower benchmark report (standard)

Generated: 2026-04-13T20:20:56.928Z
Fixture: 840 total files, 210 selected files

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 6.28 | 8.53 | 5.46 | 8.53 | 6 |
| tree:selected | 0.28 | 0.44 | 0.19 | 0.44 | 6 |
| tree:full | 0.66 | 0.72 | 0.61 | 0.72 | 6 |
| tokens:legacy-full | 57.95 | 67.07 | 55.09 | 67.07 | 6 |
| tokens:selected | 13.86 | 14.41 | 13.31 | 14.41 | 6 |
| tokens:full | 58.73 | 62.18 | 56.14 | 62.18 | 6 |
| tokens:warm-full | 54.22 | 56.40 | 52.58 | 56.40 | 6 |
| context:selected-tree | 6.37 | 6.54 | 6.21 | 6.54 | 6 |
| context:full-tree | 7.19 | 7.65 | 6.85 | 7.65 | 6 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | -2.51 | -28.54% | -3.77 | -30.63% |
| tree:selected | -0.01 | -1.90% | -0.01 | -1.70% |
| tree:full | -0.09 | -12.63% | -0.22 | -23.27% |
| tokens:legacy-full | -8.50 | -12.79% | -6.95 | -9.40% |
| tokens:selected | -4.70 | -25.33% | -8.49 | -37.07% |
| tokens:full | -2.69 | -4.38% | -2.12 | -3.29% |
| tokens:warm-full | -4.88 | -8.26% | -10.27 | -15.41% |
| context:selected-tree | -0.25 | -3.81% | -0.84 | -11.37% |
| context:full-tree | -0.20 | -2.75% | -0.97 | -11.30% |
