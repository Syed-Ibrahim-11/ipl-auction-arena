export const SCHEMA_VERSION = "6";

// Kept separate so an existing shipped database can gain the multiplayer tables at runtime.
export const LOBBY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auction_lobbies (
  session_id TEXT PRIMARY KEY REFERENCES auction_sessions(id) ON DELETE CASCADE,
  join_code TEXT NOT NULL UNIQUE,
  host_participant_id TEXT,
  status TEXT NOT NULL DEFAULT 'lobby',
  paused INTEGER NOT NULL DEFAULT 0,
  tick_ms INTEGER NOT NULL DEFAULT 1500,
  last_tick_at TEXT,
  tick_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS auction_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  display_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  is_host INTEGER NOT NULL DEFAULT 0,
  is_ready INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (session_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_session ON auction_participants(session_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_participants_token ON auction_participants(token);
CREATE INDEX IF NOT EXISTS idx_participants_team ON auction_participants(session_id, team_id);

CREATE TABLE IF NOT EXISTS auction_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  participant_id TEXT,
  team_id TEXT,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON auction_chat(session_id, id);

CREATE TABLE IF NOT EXISTS auction_voice_clips (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  chat_id INTEGER NOT NULL,
  participant_id TEXT,
  mime TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_session ON auction_voice_clips(session_id, created_at);

CREATE TABLE IF NOT EXISTS season_sim_votes (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (season_id, team_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_match_stats_player_season ON player_match_stats(player_id, season);
CREATE INDEX IF NOT EXISTS idx_career_stats_last_season ON player_career_stats(last_season, player_id);
`;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  city TEXT,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  ink_color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  cricsheet_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  nationality TEXT,
  country TEXT,
  is_overseas INTEGER CHECK (is_overseas IN (0, 1) OR is_overseas IS NULL),
  capped INTEGER CHECK (capped IN (0, 1) OR capped IS NULL),
  birth_date TEXT,
  role TEXT NOT NULL DEFAULT 'unknown',
  role_source TEXT,
  batting_style TEXT,
  bowling_style TEXT,
  primary_team_id TEXT REFERENCES teams(id),
  data_status TEXT NOT NULL DEFAULT 'registry_only',
  wikidata_id TEXT,
  wikidata_retrieved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_role ON players(role);
CREATE INDEX IF NOT EXISTS idx_players_overseas ON players(is_overseas);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(primary_team_id);

CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  UNIQUE (player_id, alias, source)
);
CREATE INDEX IF NOT EXISTS idx_alias_normalized ON player_aliases(normalized);

CREATE TABLE IF NOT EXISTS player_career_stats (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  matches INTEGER NOT NULL DEFAULT 0,
  first_season INTEGER,
  last_season INTEGER,
  teams_count INTEGER NOT NULL DEFAULT 0,
  innings_bat INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  balls_faced INTEGER NOT NULL DEFAULT 0,
  dismissals INTEGER NOT NULL DEFAULT 0,
  not_outs INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  fifties INTEGER NOT NULL DEFAULT 0,
  hundreds INTEGER NOT NULL DEFAULT 0,
  high_score INTEGER NOT NULL DEFAULT 0,
  high_score_not_out INTEGER NOT NULL DEFAULT 0,
  twenty_plus INTEGER NOT NULL DEFAULT 0,
  innings_bowl INTEGER NOT NULL DEFAULT 0,
  balls_bowled INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  best_bowling_wickets INTEGER,
  best_bowling_runs INTEGER,
  dots INTEGER NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  run_outs INTEGER NOT NULL DEFAULT 0,
  stumpings INTEGER NOT NULL DEFAULT 0,
  pp_runs INTEGER NOT NULL DEFAULT 0,
  pp_balls INTEGER NOT NULL DEFAULT 0,
  pp_dismissals INTEGER NOT NULL DEFAULT 0,
  pp_fours INTEGER NOT NULL DEFAULT 0,
  pp_sixes INTEGER NOT NULL DEFAULT 0,
  mid_runs INTEGER NOT NULL DEFAULT 0,
  mid_balls INTEGER NOT NULL DEFAULT 0,
  mid_dismissals INTEGER NOT NULL DEFAULT 0,
  mid_fours INTEGER NOT NULL DEFAULT 0,
  mid_sixes INTEGER NOT NULL DEFAULT 0,
  death_runs INTEGER NOT NULL DEFAULT 0,
  death_balls INTEGER NOT NULL DEFAULT 0,
  death_dismissals INTEGER NOT NULL DEFAULT 0,
  death_fours INTEGER NOT NULL DEFAULT 0,
  death_sixes INTEGER NOT NULL DEFAULT 0,
  pp_bowl_balls INTEGER NOT NULL DEFAULT 0,
  pp_bowl_runs INTEGER NOT NULL DEFAULT 0,
  pp_bowl_wickets INTEGER NOT NULL DEFAULT 0,
  pp_bowl_dots INTEGER NOT NULL DEFAULT 0,
  mid_bowl_balls INTEGER NOT NULL DEFAULT 0,
  mid_bowl_runs INTEGER NOT NULL DEFAULT 0,
  mid_bowl_wickets INTEGER NOT NULL DEFAULT 0,
  mid_bowl_dots INTEGER NOT NULL DEFAULT 0,
  death_bowl_balls INTEGER NOT NULL DEFAULT 0,
  death_bowl_runs INTEGER NOT NULL DEFAULT 0,
  death_bowl_wickets INTEGER NOT NULL DEFAULT 0,
  death_bowl_dots INTEGER NOT NULL DEFAULT 0,
  phases_json TEXT
);

CREATE TABLE IF NOT EXISTS player_season_stats (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  matches INTEGER NOT NULL DEFAULT 0,
  innings_bat INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  balls_faced INTEGER NOT NULL DEFAULT 0,
  dismissals INTEGER NOT NULL DEFAULT 0,
  not_outs INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  fifties INTEGER NOT NULL DEFAULT 0,
  hundreds INTEGER NOT NULL DEFAULT 0,
  high_score INTEGER NOT NULL DEFAULT 0,
  high_score_not_out INTEGER NOT NULL DEFAULT 0,
  twenty_plus INTEGER NOT NULL DEFAULT 0,
  innings_bowl INTEGER NOT NULL DEFAULT 0,
  balls_bowled INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  best_bowling_wickets INTEGER,
  best_bowling_runs INTEGER,
  dots INTEGER NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  run_outs INTEGER NOT NULL DEFAULT 0,
  stumpings INTEGER NOT NULL DEFAULT 0,
  phases_json TEXT,
  PRIMARY KEY (player_id, season, team_id)
);
CREATE INDEX IF NOT EXISTS idx_season_stats_season ON player_season_stats(season);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  match_number INTEGER,
  date TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  team1_id TEXT NOT NULL REFERENCES teams(id),
  team2_id TEXT NOT NULL REFERENCES teams(id),
  toss_winner_id TEXT REFERENCES teams(id),
  toss_decision TEXT,
  winner_id TEXT REFERENCES teams(id),
  result TEXT,
  win_by_runs INTEGER,
  win_by_wickets INTEGER,
  player_of_match TEXT,
  player_of_match_id TEXT REFERENCES players(id),
  team1_score TEXT,
  team2_score TEXT,
  team1_overs REAL,
  team2_overs REAL,
  stage TEXT,
  source TEXT NOT NULL,
  source_match_id TEXT,
  dls INTEGER NOT NULL DEFAULT 0,
  dls_revised_target INTEGER,
  target_overs REAL,
  method TEXT,
  officials_json TEXT,
  innings_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);

CREATE TABLE IF NOT EXISTS player_match_stats (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  date TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  opponent_team_id TEXT NOT NULL REFERENCES teams(id),
  venue TEXT,
  runs INTEGER NOT NULL DEFAULT 0,
  balls_faced INTEGER NOT NULL DEFAULT 0,
  fours INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  dismissal TEXT,
  not_out INTEGER NOT NULL DEFAULT 0,
  balls_bowled INTEGER NOT NULL DEFAULT 0,
  runs_conceded INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  dots INTEGER NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  run_outs INTEGER NOT NULL DEFAULT 0,
  stumpings INTEGER NOT NULL DEFAULT 0,
  pp_runs INTEGER NOT NULL DEFAULT 0,
  pp_balls INTEGER NOT NULL DEFAULT 0,
  mid_runs INTEGER NOT NULL DEFAULT 0,
  mid_balls INTEGER NOT NULL DEFAULT 0,
  death_runs INTEGER NOT NULL DEFAULT 0,
  death_balls INTEGER NOT NULL DEFAULT 0,
  phases_json TEXT,
  PRIMARY KEY (player_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_match_stats_player_date ON player_match_stats(player_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_match_stats_match ON player_match_stats(match_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_number INTEGER NOT NULL,
  over_number INTEGER NOT NULL,
  ball_number INTEGER NOT NULL,
  actual_delivery TEXT,
  batter_id TEXT NOT NULL REFERENCES players(id),
  bowler_id TEXT NOT NULL REFERENCES players(id),
  non_striker_id TEXT REFERENCES players(id),
  runs_batter INTEGER NOT NULL DEFAULT 0,
  runs_extras INTEGER NOT NULL DEFAULT 0,
  runs_total INTEGER NOT NULL DEFAULT 0,
  extras_json TEXT,
  wicket_kind TEXT,
  player_out_id TEXT REFERENCES players(id),
  fielders_json TEXT,
  is_legal INTEGER NOT NULL,
  phase TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_match ON deliveries(match_id, innings_number, over_number, ball_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_bowler ON deliveries(bowler_id);

CREATE TABLE IF NOT EXISTS points_table (
  season INTEGER NOT NULL,
  position INTEGER NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  no_result INTEGER NOT NULL DEFAULT 0,
  net_run_rate REAL,
  points INTEGER NOT NULL,
  PRIMARY KEY (season, team_id)
);

CREATE TABLE IF NOT EXISTS auction_players (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  auction_year INTEGER NOT NULL,
  base_price_lakh INTEGER NOT NULL,
  base_price_verified INTEGER NOT NULL DEFAULT 0,
  winning_bid_lakh INTEGER,
  buyer_team_id TEXT REFERENCES teams(id),
  capped_label TEXT,
  nationality_label TEXT,
  source TEXT NOT NULL,
  original_team_id TEXT REFERENCES teams(id),
  original_team_source TEXT,
  rtm_eligible INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_auction_players_base ON auction_players(base_price_lakh);

CREATE TABLE IF NOT EXISTS rulebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season INTEGER NOT NULL,
  auction_type TEXT NOT NULL,
  status TEXT NOT NULL,
  purse_cap_lakh INTEGER NOT NULL,
  purse_cap_verified INTEGER NOT NULL DEFAULT 0,
  squad_min INTEGER NOT NULL,
  squad_max INTEGER NOT NULL,
  overseas_max INTEGER NOT NULL,
  rtm_cards INTEGER NOT NULL DEFAULT 0,
  increments_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_ratings (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  formula_version TEXT NOT NULL,
  as_of_season INTEGER NOT NULL,
  role TEXT NOT NULL,
  ovr INTEGER,
  batting INTEGER,
  bowling INTEGER,
  fielding INTEGER,
  batting_raw REAL,
  bowling_raw REAL,
  fielding_raw REAL,
  evidence_quality TEXT NOT NULL,
  breakdown_json TEXT NOT NULL,
  sample_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ratings_ovr ON player_ratings(ovr DESC);

CREATE TABLE IF NOT EXISTS player_rating_versions (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  as_of_season INTEGER NOT NULL,
  formula_version TEXT NOT NULL,
  role TEXT NOT NULL,
  ovr INTEGER,
  batting INTEGER,
  bowling INTEGER,
  fielding INTEGER,
  batting_raw REAL,
  bowling_raw REAL,
  fielding_raw REAL,
  evidence_quality TEXT NOT NULL,
  breakdown_json TEXT NOT NULL,
  sample_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (player_id, as_of_season)
);
CREATE INDEX IF NOT EXISTS idx_rating_versions_season ON player_rating_versions(as_of_season, ovr DESC);

CREATE TABLE IF NOT EXISTS player_images (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  file_path TEXT,
  source TEXT,
  author TEXT,
  license TEXT,
  license_url TEXT,
  source_url TEXT,
  verified_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS auction_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  season INTEGER NOT NULL,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id),
  status TEXT NOT NULL,
  user_team_id TEXT REFERENCES teams(id),
  current_lot_id TEXT,
  pool_source TEXT NOT NULL,
  total_lots INTEGER NOT NULL DEFAULT 0,
  completed_lots INTEGER NOT NULL DEFAULT 0,
  purse_cap_lakh INTEGER NOT NULL,
  squad_min INTEGER NOT NULL,
  squad_max INTEGER NOT NULL,
  overseas_max INTEGER NOT NULL,
  rtm_cards INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON auction_sessions(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS session_teams (
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  is_human INTEGER NOT NULL DEFAULT 0,
  opening_purse_lakh INTEGER NOT NULL,
  purse_lakh INTEGER NOT NULL,
  spent_lakh INTEGER NOT NULL DEFAULT 0,
  pre_existing_value_lakh INTEGER NOT NULL DEFAULT 0,
  rtm_remaining INTEGER NOT NULL DEFAULT 0,
  ai_profile TEXT NOT NULL DEFAULT 'balanced',
  PRIMARY KEY (session_id, team_id)
);

CREATE TABLE IF NOT EXISTS session_squads (
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  price_lakh INTEGER NOT NULL,
  price_verified INTEGER NOT NULL DEFAULT 0,
  acquired_via TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_squads_team ON session_squads(session_id, team_id);

CREATE TABLE IF NOT EXISTS auction_lots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  lot_number INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  set_name TEXT,
  base_price_lakh INTEGER NOT NULL,
  base_price_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  current_bid_lakh INTEGER,
  leader_team_id TEXT REFERENCES teams(id),
  original_team_id TEXT REFERENCES teams(id),
  rtm_available INTEGER NOT NULL DEFAULT 0,
  rtm_status TEXT,
  revised_price_lakh INTEGER,
  quiet_ticks INTEGER NOT NULL DEFAULT 0,
  bid_count INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT,
  closing_at TEXT,
  resolved_at TEXT,
  winning_team_id TEXT REFERENCES teams(id),
  final_price_lakh INTEGER,
  sold_via TEXT,
  UNIQUE (session_id, lot_number)
);
CREATE INDEX IF NOT EXISTS idx_lots_session_status ON auction_lots(session_id, status, lot_number);

CREATE TABLE IF NOT EXISTS auction_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  amount_lakh INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_lot ON auction_bids(lot_id, id);

CREATE TABLE IF NOT EXISTS auction_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  lot_id TEXT,
  type TEXT NOT NULL,
  amount_lakh INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_session ON auction_transactions(session_id, created_at);

CREATE TABLE IF NOT EXISTS auction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  lot_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON auction_events(session_id, id);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES auction_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  season_year INTEGER NOT NULL,
  as_of_season INTEGER NOT NULL,
  user_team_id TEXT NOT NULL REFERENCES teams(id),
  schedule_source TEXT NOT NULL,
  schedule_note TEXT NOT NULL,
  seed INTEGER NOT NULL,
  champion_team_id TEXT REFERENCES teams(id),
  runner_up_team_id TEXT REFERENCES teams(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  result_json TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS season_teams (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  is_user_controlled INTEGER NOT NULL DEFAULT 0,
  tactics TEXT NOT NULL DEFAULT 'balanced',
  batting_aggression INTEGER NOT NULL DEFAULT 50,
  bowling_aggression INTEGER NOT NULL DEFAULT 50,
  lineup_locked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, team_id)
);

CREATE TABLE IF NOT EXISTS season_fixtures (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  stage TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  match_date TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  home_team_id TEXT REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  template_match_id TEXT REFERENCES matches(id),
  status TEXT NOT NULL DEFAULT 'scheduled',
  toss_winner_id TEXT REFERENCES teams(id),
  toss_decision TEXT,
  winner_team_id TEXT REFERENCES teams(id),
  result_summary TEXT,
  home_score TEXT,
  away_score TEXT,
  home_runs INTEGER,
  home_wickets INTEGER,
  home_balls INTEGER,
  away_runs INTEGER,
  away_wickets INTEGER,
  away_balls INTEGER,
  player_of_match_id TEXT REFERENCES players(id),
  state_json TEXT,
  home_ready INTEGER NOT NULL DEFAULT 0,
  away_ready INTEGER NOT NULL DEFAULT 0,
  ready_deadline_at TEXT,
  completed_at TEXT,
  UNIQUE (season_id, match_number)
);
CREATE INDEX IF NOT EXISTS idx_season_fixtures_season ON season_fixtures(season_id, match_number);
CREATE INDEX IF NOT EXISTS idx_season_fixtures_status ON season_fixtures(season_id, status);

CREATE TABLE IF NOT EXISTS season_lineups (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  batting_order INTEGER NOT NULL DEFAULT 0,
  is_captain INTEGER NOT NULL DEFAULT 0,
  is_keeper INTEGER NOT NULL DEFAULT 0,
  is_playing INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (season_id, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_season_lineups_team ON season_lineups(season_id, team_id, is_playing);

CREATE TABLE IF NOT EXISTS season_callups (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

CREATE TABLE IF NOT EXISTS season_innings (
  fixture_id TEXT NOT NULL REFERENCES season_fixtures(id) ON DELETE CASCADE,
  innings_number INTEGER NOT NULL,
  batting_team_id TEXT NOT NULL REFERENCES teams(id),
  bowling_team_id TEXT NOT NULL REFERENCES teams(id),
  runs INTEGER NOT NULL DEFAULT 0,
  wickets INTEGER NOT NULL DEFAULT 0,
  legal_balls INTEGER NOT NULL DEFAULT 0,
  extras INTEGER NOT NULL DEFAULT 0,
  target INTEGER,
  status TEXT NOT NULL DEFAULT 'live',
  PRIMARY KEY (fixture_id, innings_number)
);

CREATE TABLE IF NOT EXISTS season_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id TEXT NOT NULL REFERENCES season_fixtures(id) ON DELETE CASCADE,
  innings_number INTEGER NOT NULL,
  delivery_number INTEGER NOT NULL,
  over_number INTEGER NOT NULL,
  ball_in_over INTEGER NOT NULL,
  batter_id TEXT NOT NULL REFERENCES players(id),
  bowler_id TEXT NOT NULL REFERENCES players(id),
  non_striker_id TEXT REFERENCES players(id),
  runs_batter INTEGER NOT NULL DEFAULT 0,
  runs_extras INTEGER NOT NULL DEFAULT 0,
  runs_total INTEGER NOT NULL DEFAULT 0,
  extra_type TEXT,
  wicket_type TEXT,
  player_out_id TEXT REFERENCES players(id),
  fielder_id TEXT REFERENCES players(id),
  is_legal INTEGER NOT NULL,
  free_hit INTEGER NOT NULL DEFAULT 0,
  score_runs INTEGER NOT NULL,
  score_wickets INTEGER NOT NULL,
  commentary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (fixture_id, innings_number, delivery_number)
);
CREATE INDEX IF NOT EXISTS idx_season_deliveries_fixture ON season_deliveries(fixture_id, innings_number, delivery_number);
CREATE INDEX IF NOT EXISTS idx_season_deliveries_batter ON season_deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_season_deliveries_bowler ON season_deliveries(bowler_id);

CREATE TABLE IF NOT EXISTS import_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  license TEXT,
  attribution TEXT,
  retrieved_at TEXT,
  record_count INTEGER,
  notes TEXT
);

${LOBBY_SCHEMA_SQL}
`;
