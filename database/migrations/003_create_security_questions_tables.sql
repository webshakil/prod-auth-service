-- Security questions for fallback authentication

CREATE TABLE votteryy_security_question_templates (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  category VARCHAR(100), -- 'personal', 'family', 'place', 'event', 'preference'
  difficulty_level VARCHAR(20), -- 'easy', 'medium', 'hard'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User's selected security questions and answers
CREATE TABLE votteryy_user_security_questions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id VARCHAR(255),
  question_id INT NOT NULL,
  answer_hash VARCHAR(255) NOT NULL, -- hashed answer
  is_verified BOOLEAN DEFAULT FALSE,
  verification_attempt_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  FOREIGN KEY (question_id) REFERENCES votteryy_security_question_templates(id)
);