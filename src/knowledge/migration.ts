export const knowledgeMigration = `
CREATE TABLE knowledge_records (
  scope TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL,
  name TEXT NOT NULL, search_text TEXT NOT NULL, lifecycle TEXT NOT NULL,
  source_id TEXT, target_id TEXT, predicate TEXT,
  PRIMARY KEY(scope,id)
) STRICT;
CREATE INDEX knowledge_source ON knowledge_records(scope,source_id,id);
CREATE INDEX knowledge_target ON knowledge_records(scope,target_id,id);
CREATE TABLE knowledge_revisions (
  scope TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(scope,id,version), FOREIGN KEY(scope,id) REFERENCES knowledge_records(scope,id)
) STRICT;
CREATE TABLE knowledge_evidence (
  scope TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, observation_id TEXT NOT NULL, quote TEXT NOT NULL,
  FOREIGN KEY(scope,id,version) REFERENCES knowledge_revisions(scope,id,version),
  FOREIGN KEY(observation_id) REFERENCES observations(id)
) STRICT;
CREATE TABLE knowledge_dependencies (
  scope TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, target_id TEXT NOT NULL, target_version INTEGER NOT NULL,
  PRIMARY KEY(scope,id,version,target_id),
  FOREIGN KEY(scope,id,version) REFERENCES knowledge_revisions(scope,id,version),
  FOREIGN KEY(scope,target_id,target_version) REFERENCES knowledge_revisions(scope,id,version)
) STRICT;
CREATE TABLE knowledge_verifications (
  scope TEXT NOT NULL, id TEXT NOT NULL, target_id TEXT NOT NULL, target_version INTEGER NOT NULL, recorded_at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(scope,id), FOREIGN KEY(scope,target_id,target_version) REFERENCES knowledge_revisions(scope,id,version)
) STRICT;
CREATE INDEX knowledge_verification_target ON knowledge_verifications(scope,target_id,target_version);
CREATE TABLE knowledge_verification_evidence (
  scope TEXT NOT NULL, verification_id TEXT NOT NULL, observation_id TEXT NOT NULL, quote TEXT NOT NULL,
  FOREIGN KEY(scope,verification_id) REFERENCES knowledge_verifications(scope,id),
  FOREIGN KEY(observation_id) REFERENCES observations(id)
) STRICT;
CREATE VIRTUAL TABLE knowledge_fts USING fts5(scope UNINDEXED,id UNINDEXED,text,tokenize='trigram');
`
