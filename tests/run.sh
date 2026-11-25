#!/usr/bin/env bash
# 전체 테스트: bash tests/run.sh  (Playwright와 크로미움이 깔린 환경 필요)
set -eo pipefail # 하나라도 실패하면 거기서 멈춤
cd "$(dirname "$0")"
for t in version.js smoke.js; do
  echo "== $t"; node "$t" | tail -1
done
