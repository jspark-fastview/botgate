-- CDN 온보딩 (설계 §10): 채널별 ingest 인증 토큰.
-- integration_mode='cdn_cloudflare' 채널이 이 토큰으로 bot-ingest-adapter 에 push
-- (Cloudflare Logpush header_Authorization: Bearer <ingest_token>).
-- adapter 가 token→channel 매핑(domain/owner_id)에 사용.
--
-- integration_mode 는 V1 에 이미 존재(TEXT, 기본 reverse_proxy) → 'cdn_cloudflare' 는 값일 뿐 스키마 변경 불필요.
-- verify_token(external 모드용)과 분리 — 용도/수명이 다름.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS ingest_token TEXT;

-- adapter 의 token→channel 조회용 (NULL 인 비-CDN 채널은 인덱스 제외).
CREATE INDEX IF NOT EXISTS idx_channels_ingest_token
  ON channels (ingest_token) WHERE ingest_token IS NOT NULL;
