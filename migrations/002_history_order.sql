ALTER TABLE notes ADD COLUMN ticket_revision integer NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN ticket_revision integer NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN ticket_revision integer NOT NULL DEFAULT 0;
CREATE INDEX notes_revision ON notes(project_id,ticket_id,ticket_revision DESC);
CREATE INDEX submissions_revision ON submissions(project_id,ticket_id,ticket_revision DESC);
CREATE INDEX reviews_revision ON reviews(project_id,ticket_id,ticket_revision DESC);
