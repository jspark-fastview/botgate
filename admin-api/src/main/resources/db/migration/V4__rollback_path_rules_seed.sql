-- V4: path_rules V3 seed 롤백 (2026-05-20)
-- V3 의 15개 path_rules 가 admin UI 에 잡음. 운영자 결정으로 제거.
-- bot_catalog 의 V3 추가 봇들은 유지 (분류 정확도 가치 있음).

DELETE FROM path_rules WHERE id IN (
  'pr_pagination_query',
  'pr_pagination_paged',
  'pr_pagination_path_wp',
  'pr_search_s',
  'pr_search_q',
  'pr_search_query',
  'pr_search_path',
  'pr_tag',
  'pr_tags',
  'pr_archive',
  'pr_archives',
  'pr_feed',
  'pr_wp_login',
  'pr_wp_admin_ajax',
  'pr_wp_xmlrpc'
);
