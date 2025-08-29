-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 14, 2025 at 11:50 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `employee_declarations`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin_users`
--

CREATE TABLE `admin_users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `role` enum('super_admin','hr_admin','finance_admin') DEFAULT 'hr_admin',
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login` timestamp NULL DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin_users`
--

INSERT INTO `admin_users` (`id`, `username`, `password`, `email`, `role`, `first_name`, `last_name`, `is_active`, `created_at`, `updated_at`, `last_login`, `created_by`) VALUES
(1, 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@mombasa.go.ke', 'super_admin', 'System', 'Administrator', 1, '2025-08-11 08:39:12', '2025-08-14 09:39:11', '2025-08-14 09:39:11', 1),
(2, 'hr_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'hr@mombasa.go.ke', 'hr_admin', 'HR', 'Administrator', 1, '2025-08-11 08:39:12', '2025-08-11 08:39:12', NULL, 1),
(3, 'finance_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'finance@mombasa.go.ke', 'finance_admin', 'Finance', 'Administrator', 1, '2025-08-11 08:39:12', '2025-08-11 08:39:12', NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `children`
--

CREATE TABLE `children` (
  `id` int(11) NOT NULL,
  `declaration_id` int(11) NOT NULL,
  `surname` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `other_names` varchar(100) DEFAULT NULL,
  `full_name` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `declarations`
--

CREATE TABLE `declarations` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `marital_status` enum('single','married','divorced','widowed','separated') NOT NULL,
  `declaration_date` date NOT NULL,
  `annual_income` decimal(15,2) DEFAULT NULL,
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `signature_path` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `declarations`
--

INSERT INTO `declarations` (`id`, `user_id`, `marital_status`, `declaration_date`, `annual_income`, `assets`, `liabilities`, `other_financial_info`, `signature_path`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 'married', '0000-00-00', 0.00, '[object Object]', '[object Object]', '', NULL, 'pending', '2025-08-14 05:58:25', '2025-08-14 05:58:25'),
(3, 1, 'married', '0000-00-00', 0.00, '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', '', 'pending', '2025-08-14 07:43:11', '2025-08-14 07:43:11'),
(4, 1, 'married', '0000-00-00', 0.00, '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', '', 'pending', '2025-08-14 09:38:58', '2025-08-14 09:38:58');

-- --------------------------------------------------------

--
-- Table structure for table `financial_declarations`
--

CREATE TABLE `financial_declarations` (
  `id` int(11) NOT NULL,
  `declaration_id` int(11) NOT NULL,
  `member_type` enum('user','spouse','child') NOT NULL,
  `member_name` varchar(200) NOT NULL,
  `declaration_date` date NOT NULL,
  `period_start_date` date NOT NULL,
  `period_end_date` date NOT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `financial_items`
--

CREATE TABLE `financial_items` (
  `id` int(11) NOT NULL,
  `financial_declaration_id` int(11) NOT NULL,
  `item_type` enum('income','asset','liability') NOT NULL,
  `description` varchar(500) NOT NULL,
  `value` decimal(15,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `spouses`
--

CREATE TABLE `spouses` (
  `id` int(11) NOT NULL,
  `declaration_id` int(11) NOT NULL,
  `surname` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `other_names` varchar(100) DEFAULT NULL,
  `full_name` varchar(200) DEFAULT NULL,
  `occupation` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `payroll_number` varchar(50) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `birthdate` date NOT NULL,
  `password` varchar(255) NOT NULL,
  `password_changed` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `place_of_birth` varchar(200) DEFAULT NULL,
  `postal_address` varchar(200) DEFAULT NULL,
  `physical_address` text DEFAULT NULL,
  `designation` varchar(200) DEFAULT NULL,
  `department` varchar(200) DEFAULT NULL,
  `employment_nature` enum('permanent','temporary','contract','casual') DEFAULT 'permanent'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `payroll_number`, `first_name`, `last_name`, `email`, `birthdate`, `password`, `password_changed`, `created_at`, `updated_at`, `place_of_birth`, `postal_address`, `physical_address`, `designation`, `department`, `employment_nature`) VALUES
(1, '20240326066', 'MR SWALEH', 'MOHAMED ABDULGHAFUR', 'swalehabdulghafur@gmail.com', '0700191407', '1998-01-29', '$2a$10$UAMM9nXxuu3NKLpDaklzbu2bP.vJ8nHNGxOsh71HCzjZ7Gx7XhCtO', 1, '2025-08-08 04:05:10', '2025-08-08 07:21:00', NULL, NULL, NULL, NULL, NULL, 'permanent');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin_users`
--
ALTER TABLE `admin_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `idx_username` (`username`),
  ADD KEY `idx_role` (`role`),
  ADD KEY `idx_active` (`is_active`);

--
-- Indexes for table `children`
--
ALTER TABLE `children`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_children_declaration` (`declaration_id`);

--
-- Indexes for table `declarations`
--
ALTER TABLE `declarations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_declarations_user` (`user_id`),
  ADD KEY `idx_declarations_date` (`declaration_date`);

--
-- Indexes for table `financial_declarations`
--
ALTER TABLE `financial_declarations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `declaration_id` (`declaration_id`);

--
-- Indexes for table `financial_items`
--
ALTER TABLE `financial_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `financial_declaration_id` (`financial_declaration_id`);

--
-- Indexes for table `spouses`
--
ALTER TABLE `spouses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_spouses_declaration` (`declaration_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `payroll_number` (`payroll_number`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_users_payroll` (`payroll_number`),
  ADD KEY `idx_users_email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin_users`
--
ALTER TABLE `admin_users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `children`
--
ALTER TABLE `children`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `declarations`
--
ALTER TABLE `declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `financial_declarations`
--
ALTER TABLE `financial_declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `financial_items`
--
ALTER TABLE `financial_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `spouses`
--
ALTER TABLE `spouses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `children`
--
ALTER TABLE `children`
  ADD CONSTRAINT `children_ibfk_1` FOREIGN KEY (`declaration_id`) REFERENCES `declarations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `declarations`
--
ALTER TABLE `declarations`
  ADD CONSTRAINT `declarations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `financial_declarations`
--
ALTER TABLE `financial_declarations`
  ADD CONSTRAINT `financial_declarations_ibfk_1` FOREIGN KEY (`declaration_id`) REFERENCES `declarations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `financial_items`
--
ALTER TABLE `financial_items`
  ADD CONSTRAINT `financial_items_ibfk_1` FOREIGN KEY (`financial_declaration_id`) REFERENCES `financial_declarations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `spouses`
--
ALTER TABLE `spouses`
  ADD CONSTRAINT `spouses_ibfk_1` FOREIGN KEY (`declaration_id`) REFERENCES `declarations` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
