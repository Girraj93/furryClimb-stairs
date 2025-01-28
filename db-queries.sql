DROP DATABASE if EXISTS `fury_fair_db`;
CREATE DATABASE IF NOT EXISTS `fury_fair_db`;
use `fury_fair_db`;

 CREATE TABLE IF NOT EXISTS `settlement`(
   `settlement_id` int NOT NULL AUTO_INCREMENT,
   `bet_id` varchar(255) NOT NULL,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `match_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
   `win_amount` decimal(10, 2) DEFAULT 0.00,
   `multiplier`  decimal(10, 2) DEFAULT 0.00,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`settlement_id`)
 );

CREATE TABLE IF NOT EXISTS `bets` (
   `id` int primary key  auto_increment,
   `bet_id` varchar(255) NOT NULL,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `match_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 ); 

CREATE TABLE IF NOT EXISTS `match_round` (
   `id` int primary key  auto_increment,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `match_id` varchar(255) DEFAULT NULL,
   `game_data`JSON NOT NULL,
   `is_winner` BOOLEAN DEFAULT FALSE,
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 ); 
 CREATE TABLE IF NOT EXISTS `game_templates` (
   `id` INT NOT NULL AUTO_INCREMENT,
   `multipliers` JSON NOT NULL, 
   `hidden_tiles` JSON NOT NULL, 
   `is_active` TINYINT NOT NULL DEFAULT '1',
   `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


  INSERT INTO `game_templates` (multipliers, hidden_tiles) 
VALUES (
    '{
      "1": [1.04, 1.09, 1.14, 1.20, 1.25, 1.33, 1.39, 1.49, 1.60, 1.67, 1.82, 2.00, 2.23],
      "2": [1.09, 1.19, 1.30, 1.44, 1.57, 1.76, 1.94, 2.21, 2.54, 2.78, 3.28, 3.93, 4.82],
      "3": [1.13, 1.29, 1.47, 1.71, 1.95, 2.30, 2.66, 3.22, 3.94, 4.50, 5.16, 6.69, 8.95],
      "4": [1.18, 1.40, 1.66, 2.01, 2.41, 2.99, 3.62, 4.62, 5.99, 7.12, 9.69, 13.53, 19.62],
      "5": [1.22, 1.51, 1.89, 2.4, 2.96, 3.84, 5.02, 6.76, 9.29, 11.49, 16.67, 24.92, 38.94]
    }',
    '[
      [],
      [0],
      [19],
      [17, 18, 19],
      [0],
      [0, 1, 2, 18, 19],
      [17, 18, 19],
      [13, 14, 15, 16, 17, 18, 19],
      [12, 13, 14, 15, 16, 17, 18, 19],
      [0],
      [0, 1, 2, 3, 14, 15, 16, 17, 18, 19],
      [0, 1, 2, 3, 4, 14, 15, 16, 17, 18, 19],
      [0, 1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19]
    ]'
);
ALTER TABLE `fury_fair_db`.`bets` 
ADD INDEX `inx_bet_id` (`bet_id` ASC) INVISIBLE, 
ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, 
ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE,
ADD INDEX `inx_match_id` (`match_id` ASC) VISIBLE, 
ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, 
ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;

ALTER TABLE `fury_fair_db`.`settlement` 
ADD INDEX `inx_bet_id` (`bet_id` ASC) VISIBLE, 
ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, 
ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, 
ADD INDEX `inx_match_id` (`match_id` ASC) VISIBLE, 
ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE,
ADD INDEX `inx_win_amount` (`win_amount` ASC) INVISIBLE, 
ADD INDEX `inx_multiplier` (`multiplier` ASC) INVISIBLE, 
ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;


ALTER TABLE `fury_fair_db`.`match_round` 
ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, 
ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE,
ADD INDEX `inx_match_id` (`match_id` ASC) VISIBLE,  
ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;