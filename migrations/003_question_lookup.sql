CREATE INDEX notes_answers ON notes(answer_to) WHERE kind='answer';
CREATE INDEX notes_blocking ON notes(ticket_id) WHERE kind='question' AND blocking;
