DROP DATABASE if EXISTS `furryclimb`;
CREATE DATABASE IF NOT EXISTS `furryclimb`;
use `furryclimb`;

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

CREATE TABLE `game_templates` (
   `id` INT NOT NULL AUTO_INCREMENT,
   `multipliers` JSON NOT NULL, 
   `hidden_tiles` JSON NOT NULL, 
   `is_active` TINYINT NOT NULL DEFAULT '1',
   `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


  INSERT INTO `game_templates` (multipliers) VALUES
('{1: [
    1.02, 1.08, 1.14, 1.21, 1.29, 1.39, 1.49, 1.62, 1.76, 1.94, 2.16, 2.42,
    2.77,
  ],
  2: [
    1.08, 1.2, 1.36, 1.54, 1.76, 2.03, 2.36, 2.8, 3.35, 4.1, 5.13, 6.58, 8.76,
  ],
  3: [
    1.14, 1.36, 1.63, 1.97, 2.43, 3.03, 3.86, 5.03, 6.7, 9.21, 13.16, 19.77,
    31.71,
  ],
  4: [
    1.21, 1.53, 1.97, 2.58, 3.44, 4.69, 6.57, 9.46, 14.25, 22.37, 37.33, 67.06,
    81.85,
  ],
  5: [
    1.29, 1.76, 2.43, 3.44, 5.02, 7.51, 11.66, 18.97, 32.64, 59.91, 71.15,
    85.03, 100,
  ]}')

ALTER TABLE `furryclimb`.`bets` 
ADD INDEX `inx_bet_id` (`bet_id` ASC) INVISIBLE, 
ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, 
ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE,
ADD INDEX `inx_match_id` (`match_id` ASC) VISIBLE, 
ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, 
ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;

ALTER TABLE `furryclimb`.`settlement` 
ADD INDEX `inx_bet_id` (`bet_id` ASC) VISIBLE, 
ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, 
ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, 
ADD INDEX `inx_match_id` (`match_id` ASC) VISIBLE, 
ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE,
ADD INDEX `inx_win_amount` (`win_amount` ASC) INVISIBLE, 
ADD INDEX `inx_multiplier` (`multiplier` ASC) INVISIBLE, 
ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;
