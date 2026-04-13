# Prompt Tower benchmark report (smoke)

Generated: 2026-04-13T20:02:07.094Z
Fixture: 120 total files, 40 selected files

## Results

| Benchmark | Mean (ms) | P95 (ms) | Min (ms) | Max (ms) | Iterations |
| --- | ---: | ---: | ---: | ---: | ---: |
| file-blocks:selected | 1.23 | 1.66 | 1.06 | 1.66 | 4 |
| tree:selected | 0.07 | 0.12 | 0.05 | 0.12 | 4 |
| tree:full | 0.14 | 0.16 | 0.13 | 0.16 | 4 |
| tokens:legacy-full | 11.05 | 13.77 | 8.53 | 13.77 | 4 |
| tokens:selected | 3.01 | 3.33 | 2.79 | 3.33 | 4 |
| tokens:full | 9.00 | 10.25 | 8.46 | 10.25 | 4 |
| tokens:warm-full | 14.44 | 15.14 | 14.07 | 15.14 | 4 |
| context:selected-tree | 1.58 | 2.10 | 1.25 | 2.10 | 4 |
| context:full-tree | 1.53 | 1.59 | 1.43 | 1.59 | 4 |

## Comparison To Previous Latest

| Benchmark | Mean delta (ms) | Mean delta (%) | P95 delta (ms) | P95 delta (%) |
| --- | ---: | ---: | ---: | ---: |
| file-blocks:selected | +0.03 | +2.48% | +0.01 | +0.72% |
| tree:selected | +0.00 | +2.49% | +0.03 | +39.94% |
| tree:full | -0.01 | -9.32% | -0.06 | -29.25% |
| tokens:selected | -0.12 | -3.84% | -0.02 | -0.58% |
| tokens:full | -1.71 | -15.97% | -2.93 | -22.21% |
| context:selected-tree | +0.18 | +12.81% | +0.53 | +34.05% |
| context:full-tree | +0.11 | +7.54% | +0.02 | +1.46% |
