-- Cut off game linking columns (same as GD_Cage)
ALTER TABLE game_list
  ADD COLUMN CUTOFF_PARENT_GAME_ID INT NULL DEFAULT NULL COMMENT 'Previous game ID (cut off source)' AFTER ACTIVE,
  ADD COLUMN CUTOFF_CONTINUED_GAME_ID INT NULL DEFAULT NULL COMMENT 'Next game ID (cut off continuation)' AFTER CUTOFF_PARENT_GAME_ID;
