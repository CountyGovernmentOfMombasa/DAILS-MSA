-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 11, 2025 at 10:11 AM
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
  `role` enum('super_admin','it_admin','hr_admin','finance_admin') DEFAULT 'hr_admin',
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
(1, 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@mombasa.go.ke', 'super_admin', 'System', 'Administrator', 1, '2025-08-11 08:39:12', '2025-09-10 12:51:17', '2025-09-10 12:51:17', 1),
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
  `full_name` varchar(200) NOT NULL,
  `annual_income` text DEFAULT NULL,
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `children`
--

INSERT INTO `children` (`id`, `declaration_id`, `surname`, `first_name`, `other_names`, `full_name`, `annual_income`, `assets`, `liabilities`, `other_financial_info`, `created_at`) VALUES
(1, 4, '', '', '', '', '0.00', '[]', '[]', '', '2025-08-26 08:43:18'),
(2, 5, 'EL-Busaidy', 'Jaad', 'Swaleh', 'Jaad EL-Busaidy Swaleh', '0.00', '[]', '[]', '', '2025-08-27 08:33:02'),
(3, 6, 'EL-Busaidy', 'Jaad', 'Swaleh', 'Jaad Swaleh EL-Busaidy', '0.00', '[]', '[]', '', '2025-08-29 13:23:22'),
(4, 7, 'El-Busaidy', 'Jaad', 'Swaleh', 'Jaad Swaleh El-Busaidy', '0.00', '[]', '[]', '', '2025-09-01 07:26:51'),
(5, 8, 'EL-Busaisy', 'Jaad', 'Swaleh', 'Jaad Swaleh EL-Busaisy', '0.00', '[]', '[]', '', '2025-09-04 05:13:05'),
(6, 9, 'El-Busiady', 'Jaad', 'Swaleh', 'Jaad Swaleh El-Busiady', '0.00', '[]', '[]', '', '2025-09-04 06:12:38'),
(7, 10, 'Mohamed', 'Jaad', 'Swaleh', 'Jaad Swaleh Mohamed', '[]', '[]', '[]', '', '2025-09-08 09:00:54'),
(8, 11, 'Mohamed', 'Jaad', 'Swaleh', 'Jaad Swaleh Mohamed', '[]', '[]', '[]', '', '2025-09-09 13:11:43');

-- --------------------------------------------------------

--
-- Table structure for table `declarations`
--

CREATE TABLE `declarations` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `marital_status` enum('single','married','divorced','widowed','separated') NOT NULL,
  `declaration_date` date NOT NULL,
  `annual_income` text DEFAULT NULL,
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `signature_path` tinyint(1) DEFAULT NULL,
  `witness_signed` tinyint(1) DEFAULT 0,
  `witness_name` varchar(100) DEFAULT NULL,
  `witness_address` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `correction_message` text DEFAULT NULL,
  `declaration_type` enum('First','Bienniel','Final') DEFAULT 'Bienniel'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `declarations`
--

INSERT INTO `declarations` (`id`, `user_id`, `marital_status`, `declaration_date`, `annual_income`, `assets`, `liabilities`, `other_financial_info`, `signature_path`, `witness_signed`, `witness_name`, `witness_address`, `created_at`, `updated_at`, `status`, `correction_message`, `declaration_type`) VALUES
(1, 1, 'married', '2025-08-26', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', 0, 0, NULL, NULL, '2025-08-26 08:25:33', '2025-08-26 08:25:33', 'pending', NULL, 'Bienniel'),
(2, 1, 'married', '2025-08-26', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', 0, 0, NULL, NULL, '2025-08-26 08:25:34', '2025-08-26 08:25:34', 'pending', NULL, 'Bienniel'),
(3, 1, 'married', '2025-08-26', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"100000\"}]', '', 0, 0, NULL, NULL, '2025-08-26 08:33:37', '2025-08-26 08:33:37', 'pending', NULL, 'Bienniel'),
(4, 1, 'married', '2025-08-26', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"100000\"}]', '', 0, NULL, NULL, NULL, '2025-08-26 08:43:18', '2025-08-26 08:43:18', 'pending', NULL, 'Bienniel'),
(5, 1, 'married', '2025-08-27', '2000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', 0, 1, 'Kassim', 'Kizingo, Mombasa', '2025-08-27 08:33:02', '2025-08-27 08:33:02', 'pending', NULL, 'Bienniel'),
(6, 1, 'married', '2025-08-29', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', 0, 1, 'Ali', 'Kizingo', '2025-08-29 13:23:22', '2025-08-29 13:23:22', 'pending', NULL, 'Bienniel'),
(7, 1, 'married', '2025-09-01', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car\",\"value\":\"\"}]', '', 0, 1, 'Ali', 'Kizingo, Mombasa', '2025-09-01 07:26:51', '2025-09-01 07:26:51', 'pending', NULL, 'Bienniel'),
(8, 1, 'married', '2025-09-04', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"100000\"}]', '', 0, 1, 'Ali', 'Kizingo, Mombasa', '2025-09-04 05:13:05', '2025-09-04 05:13:06', 'pending', NULL, 'Bienniel'),
(9, 1, 'married', '2025-09-04', '1000000.00', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"100000\"}]', '', 0, 1, 'Ali', 'Kizingo', '2025-09-04 06:12:38', '2025-09-04 06:12:38', 'pending', NULL, 'Bienniel'),
(10, 1, 'married', '2025-09-08', '2000000', '[{\"description\":\"Car\",\"value\":\"1000000\"},{\"description\":\"House\",\"value\":\"20000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"10000\"},{\"description\":\"Morgage\",\"value\":\"100000\"}]', '', 0, 1, 'Ali', 'Kizingo', '2025-09-08 09:00:54', '2025-09-08 09:00:54', 'pending', NULL, 'Bienniel'),
(11, 1, 'married', '2025-09-09', '1000000', '[{\"description\":\"Car\",\"value\":\"1000000\"}]', '[{\"description\":\"Car Loan\",\"value\":\"200000\"}]', '', 0, 1, 'Ali', 'Mombasa', '2025-09-09 13:11:43', '2025-09-09 13:11:43', 'pending', NULL, 'Bienniel');

-- --------------------------------------------------------

--
-- Table structure for table `financial_declarations`
--

CREATE TABLE `financial_declarations` (
  `id` int(11) NOT NULL,
  `declaration_id` int(11) NOT NULL,
  `member_type` varchar(20) NOT NULL,
  `member_name` varchar(255) NOT NULL,
  `declaration_date` date DEFAULT NULL,
  `period_start_date` date DEFAULT NULL,
  `period_end_date` date DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `financial_declarations`
--

INSERT INTO `financial_declarations` (`id`, `declaration_id`, `member_type`, `member_name`, `declaration_date`, `period_start_date`, `period_end_date`, `other_financial_info`, `created_at`, `updated_at`) VALUES
(1, 5, 'user', 'User', '2025-08-27', '2025-08-27', '2025-08-27', '', '2025-08-27 08:33:02', '2025-08-27 08:33:02'),
(2, 5, 'user', 'User', '2025-08-27', '2025-08-27', '2025-08-27', '', '2025-08-27 08:33:02', '2025-08-27 08:33:02'),
(3, 5, 'user', 'User', '2025-08-27', '2025-08-27', '2025-08-27', '', '2025-08-27 08:33:02', '2025-08-27 08:33:02'),
(4, 6, 'user', 'User', '2025-08-29', '2025-08-29', '2025-08-29', '', '2025-08-29 13:23:22', '2025-08-29 13:23:22'),
(5, 6, 'user', 'User', '2025-08-29', '2025-08-29', '2025-08-29', '', '2025-08-29 13:23:22', '2025-08-29 13:23:22'),
(6, 6, 'user', 'User', '2025-08-29', '2025-08-29', '2025-08-29', '', '2025-08-29 13:23:22', '2025-08-29 13:23:22'),
(7, 7, 'user', 'User', '2025-09-01', '2025-09-01', '2025-09-01', '', '2025-09-01 07:26:51', '2025-09-01 07:26:51'),
(8, 7, 'user', 'User', '2025-09-01', '2025-09-01', '2025-09-01', '', '2025-09-01 07:26:51', '2025-09-01 07:26:51'),
(9, 7, 'user', 'User', '2025-09-01', '2025-09-01', '2025-09-01', '', '2025-09-01 07:26:51', '2025-09-01 07:26:51'),
(10, 8, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 05:13:05', '2025-09-04 05:13:05'),
(11, 8, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 05:13:05', '2025-09-04 05:13:05'),
(12, 8, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 05:13:05', '2025-09-04 05:13:05'),
(13, 9, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 06:12:38', '2025-09-04 06:12:38'),
(14, 9, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 06:12:38', '2025-09-04 06:12:38'),
(15, 9, 'user', 'User', '2025-09-04', '2025-09-04', '2025-09-04', '', '2025-09-04 06:12:38', '2025-09-04 06:12:38'),
(16, 10, 'user', 'User', '2025-09-08', '2025-09-08', '2025-09-08', '', '2025-09-08 09:00:54', '2025-09-08 09:00:54'),
(17, 10, 'user', 'User', '2025-09-08', '2025-09-08', '2025-09-08', '', '2025-09-08 09:00:54', '2025-09-08 09:00:54'),
(18, 10, 'user', 'User', '2025-09-08', '2025-09-08', '2025-09-08', '', '2025-09-08 09:00:54', '2025-09-08 09:00:54'),
(19, 11, 'user', 'User', '2025-09-09', '2025-09-09', '2025-09-09', '', '2025-09-09 13:11:43', '2025-09-09 13:11:43'),
(20, 11, 'user', 'User', '2025-09-09', '2025-09-09', '2025-09-09', '', '2025-09-09 13:11:43', '2025-09-09 13:11:43'),
(21, 11, 'user', 'User', '2025-09-09', '2025-09-09', '2025-09-09', '', '2025-09-09 13:11:43', '2025-09-09 13:11:43');

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
  `full_name` varchar(200) NOT NULL,
  `annual_income` text DEFAULT NULL,
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `spouses`
--

INSERT INTO `spouses` (`id`, `declaration_id`, `surname`, `first_name`, `other_names`, `full_name`, `annual_income`, `assets`, `liabilities`, `other_financial_info`, `created_at`) VALUES
(1, 4, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Loan\",\"value\":\"40000\"}]', '', '2025-08-26 08:43:18'),
(2, 5, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Stock Loan\",\"value\":\"10000\"}]', '', '2025-08-27 08:33:02'),
(3, 6, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Loan\",\"value\":\"10000\"}]', '', '2025-08-29 13:23:22'),
(4, 7, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Loan\",\"value\":\"10000\"}]', '', '2025-09-01 07:26:51'),
(5, 8, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Loan\",\"value\":\"10000\"}]', '', '2025-09-04 05:13:05'),
(6, 9, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '0.00', '[{\"description\":\"\",\"value\":\"\"}]', '[{\"description\":\"\",\"value\":\"\"}]', '', '2025-09-04 06:12:38'),
(7, 10, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '[{\"description\":\"Salary\",\"value\":\"1000000\"}]', '[{\"description\":\"Gold\",\"value\":\"1000000\"}]', '[{\"description\":\"Loan\",\"value\":\"10000\"}]', '', '2025-09-08 09:00:54'),
(8, 11, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '[{\"description\":\"Salary\",\"value\":\"500000\"}]', '[{\"description\":\"\",\"value\":\"\"}]', '[{\"description\":\"\",\"value\":\"\"}]', '', '2025-09-09 13:11:43');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `payroll_number` varchar(50) NOT NULL,
  `surname` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `other_names` varchar(100) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `birthdate` date NOT NULL,
  `password` varchar(255) NOT NULL,
  `password_changed` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `national_id` varchar(50) DEFAULT NULL,
  `place_of_birth` varchar(100) DEFAULT NULL,
  `marital_status` enum('Married','Single','Divorced','Separated','Widowed') DEFAULT NULL,
  `postal_address` varchar(255) DEFAULT NULL,
  `physical_address` varchar(255) DEFAULT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `department` enum('Department of Transport, Infrastructure and Governance','Department of Trade, Tourism and Culture','Department of Education and Vocational Training','Department of Environment and Water','Department of Lands, Urban Planning,Housing and Serikali Mtaani','Department of Health','Department of Public Service Administration, Youth, Gender and Sports','Department of Finance, Economic Planning and Digital Transformation','Department of Blue Economy ,Cooperatives, Agriculture and Livestock','Department of Climate Change,Energy and Natural Resources') DEFAULT NULL,
  `nature_of_employment` enum('Permanent','Contract','Temporary') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `payroll_number`, `surname`, `first_name`, `other_names`, `email`, `birthdate`, `password`, `password_changed`, `created_at`, `updated_at`, `national_id`, `place_of_birth`, `marital_status`, `postal_address`, `physical_address`, `designation`, `department`, `nature_of_employment`) VALUES
(1, '20240326066', 'Abdulghafur', 'Swaleh', 'Mohamed', 'swalehabdulghafur@gmail.com', '1998-01-29', '$2a$10$9/l070KeXnSsjBBL7ZLBWO4hRGUofsExMYu50pPIjrZi9iS3hrzE6', 1, '0000-00-00 00:00:00', '2025-09-11 06:20:53', '34561278', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

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
  ADD UNIQUE KEY `idx_users_national_id` (`national_id`),
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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `declarations`
--
ALTER TABLE `declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `financial_declarations`
--
ALTER TABLE `financial_declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT for table `spouses`
--
ALTER TABLE `spouses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

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
-- Constraints for table `spouses`
--
ALTER TABLE `spouses`
  ADD CONSTRAINT `spouses_ibfk_1` FOREIGN KEY (`declaration_id`) REFERENCES `declarations` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
