-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 20, 2025 at 10:31 AM
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
  `created_by` int(11) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin_users`
--

INSERT INTO `admin_users` (`id`, `username`, `password`, `email`, `role`, `first_name`, `last_name`, `is_active`, `created_at`, `updated_at`, `last_login`, `created_by`, `department`) VALUES
(1, 'admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@mombasa.go.ke', 'super_admin', 'System', 'Administrator', 1, '2025-08-11 08:39:12', '2025-09-16 07:42:18', '2025-09-16 07:42:18', 1, NULL),
(2, 'hr_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'hr@mombasa.go.ke', 'hr_admin', 'HR', 'Administrator', 1, '2025-08-11 08:39:12', '2025-09-16 07:42:54', '2025-09-16 07:42:54', 1, NULL),
(3, 'finance_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'finance@mombasa.go.ke', 'finance_admin', 'Finance', 'Administrator', 1, '2025-08-11 08:39:12', '2025-08-11 08:39:12', NULL, 1, NULL),
(4, 'it_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ict@mombasa.go.ke', 'it_admin', 'ICT', 'Admin', 1, '2025-09-16 08:48:00', '2025-09-16 08:48:00', NULL, NULL, NULL);

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
  `biennial_income` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`biennial_income`)),
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `children`
--

INSERT INTO `children` (`id`, `declaration_id`, `surname`, `first_name`, `other_names`, `full_name`, `biennial_income`, `assets`, `liabilities`, `other_financial_info`, `created_at`) VALUES
(10, 13, '', '', '', '', '[]', '[]', '[]', '', '2025-09-17 12:17:05'),
(11, 15, 'Doe', 'Jack', 'John', 'Jack John Doe', '[]', '[]', '[]', '', '2025-09-20 08:24:11'),
(12, 15, 'Doe', 'Jace', 'John', 'Jace John Doe', '[]', '[]', '[]', '', '2025-09-20 08:24:11');

-- --------------------------------------------------------

--
-- Table structure for table `declarations`
--

CREATE TABLE `declarations` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `marital_status` enum('single','married','divorced','widowed','separated') NOT NULL,
  `declaration_date` date NOT NULL,
  `biennial_income` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`biennial_income`)),
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `signature_path` tinyint(1) DEFAULT NULL,
  `witness_signed` tinyint(1) DEFAULT 0,
  `witness_name` varchar(100) DEFAULT NULL,
  `witness_address` varchar(200) DEFAULT NULL,
  `witness_phone` varchar(30) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `correction_message` text DEFAULT NULL,
  `declaration_type` enum('First','Bienniel','Final') DEFAULT 'Bienniel',
  `submitted_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `declarations`
--

INSERT INTO `declarations` (`id`, `user_id`, `marital_status`, `declaration_date`, `biennial_income`, `assets`, `liabilities`, `other_financial_info`, `signature_path`, `witness_signed`, `witness_name`, `witness_address`, `witness_phone`, `created_at`, `updated_at`, `status`, `correction_message`, `declaration_type`, `submitted_at`) VALUES
(13, 1, 'married', '2025-09-17', '1000000', '[{\"type\":\"Car\",\"description\":\"\",\"value\":\"1000000\",\"make\":\"Toyota\",\"model\":\"Axio\",\"licence_no\":\"KDC 763V\"}]', '[{\"type\":\"Non-Current Liabilities (Long-Term)\",\"description\":\"Long-Term Loans\",\"value\":\"200000\"}]', '', 0, 1, 'Ali', 'Kizingo', '0700191407', '2025-09-17 12:17:05', '2025-09-19 09:08:18', 'approved', NULL, 'First', '2025-09-17 15:17:05'),
(15, 2, 'married', '2025-09-20', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"1000000\"},{\"type\":\"Emoluments\",\"description\":\"From Family\",\"value\":\"1000000\"}]', '[{\"type\":\"Car\",\"description\":\"\",\"value\":\"1000000\",\"make\":\"Toyota\",\"model\":\"Axio\",\"licence_no\":\"KDC763D\"},{\"type\":\"Land\",\"description\":\"\",\"value\":\"1000000\",\"title_deed\":\"FR00/00/01\",\"location\":\"Nyali\"}]', '[{\"type\":\"Current Liabilities (Short-Term)\",\"description\":\"Short-Term Loans\",\"value\":\"20000\"},{\"type\":\"Non-Current Liabilities (Long-Term)\",\"description\":\"Long-Term Loans\",\"value\":\"200000\"}]', '', 0, 1, 'Fatma', 'Mombasa', '0710605596', '2025-09-20 08:24:11', '2025-09-20 08:24:11', 'pending', NULL, 'First', '2025-09-20 11:24:11');

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
(25, 13, 'user', 'User', '2025-09-17', '2025-09-17', '2025-09-17', '', '2025-09-17 12:17:05', '2025-09-17 12:17:05'),
(26, 13, 'user', 'User', '2025-09-17', '2025-09-17', '2025-09-17', '', '2025-09-17 12:17:05', '2025-09-17 12:17:05'),
(27, 15, 'user', 'User', '2025-09-20', '2024-01-01', '2024-12-31', '', '2025-09-20 08:24:11', '2025-09-20 08:24:11'),
(28, 15, 'user', 'User', '2025-09-20', '2024-01-01', '2024-12-31', '', '2025-09-20 08:24:11', '2025-09-20 08:24:11'),
(29, 15, 'user', 'User', '2025-09-20', '2024-01-01', '2024-12-31', '', '2025-09-20 08:24:11', '2025-09-20 08:24:11'),
(30, 15, 'user', 'User', '2025-09-20', '2024-01-01', '2024-12-31', '', '2025-09-20 08:24:11', '2025-09-20 08:24:11'),
(31, 15, 'user', 'User', '2025-09-20', '2024-01-01', '2024-12-31', '', '2025-09-20 08:24:11', '2025-09-20 08:24:11');

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
  `biennial_income` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`biennial_income`)),
  `assets` text DEFAULT NULL,
  `liabilities` text DEFAULT NULL,
  `other_financial_info` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `spouses`
--

INSERT INTO `spouses` (`id`, `declaration_id`, `surname`, `first_name`, `other_names`, `full_name`, `biennial_income`, `assets`, `liabilities`, `other_financial_info`, `created_at`) VALUES
(10, 13, 'Hussein', 'Fatma', 'Mohamed', 'Fatma Hussein Mohamed', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"500000\"}]', '[{\"type\":\"Other\",\"description\":\"Jewelry\",\"value\":\"1000000\",\"asset_other_type\":\"Gold\"}]', '[{\"type\":\"\",\"description\":\"\",\"value\":\"\"}]', '', '2025-09-17 12:17:05'),
(11, 15, 'Doe', 'Jane', 'Sam', 'Jane Doe Sam', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"500000\"}]', '[{\"type\":\"Building\",\"description\":\"\",\"value\":\"1000000\",\"location\":\"Mombasa\",\"title_deed\":\"h\"},{\"type\":\"Cash At Bank\",\"description\":\"At GAB\",\"value\":\"400000\"}]', '[{\"type\":\"Current Liabilities (Short-Term)\",\"description\":\"Taxes Payable\",\"value\":\"10000\"}]', '', '2025-09-20 08:24:11'),
(12, 15, 'Doe', 'Jess', 'Dan', 'Jess Doe Dan', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"500000\"},{\"type\":\"Dividends\",\"description\":\"From Safaricom Stock\",\"value\":\"40000\"}]', '[{\"type\":\"Investment\",\"description\":\"Stock in Safaricom\",\"value\":\"1000\"}]', '[{\"type\":\"Current Liabilities (Short-Term)\",\"description\":\"Short-Term Loans\",\"value\":\"1000\"}]', '', '2025-09-20 08:24:11');

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
  `phone_number` varchar(20) DEFAULT NULL,
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
  `nature_of_employment` enum('Permanent','Contract','Casual','Temporary') DEFAULT NULL
) ;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `payroll_number`, `surname`, `first_name`, `other_names`, `email`, `phone_number`, `birthdate`, `password`, `password_changed`, `created_at`, `updated_at`, `national_id`, `place_of_birth`, `marital_status`, `postal_address`, `physical_address`, `designation`, `department`, `nature_of_employment`) VALUES
(1, '20240326066', 'Abdulghafur', 'Swaleh', 'Mohamed', 'swalehabdulghafur@gmail.com', '0788276305', '1998-01-29', '$2a$10$9/l070KeXnSsjBBL7ZLBWO4hRGUofsExMYu50pPIjrZi9iS3hrzE6', 1, '0000-00-00 00:00:00', '2025-09-15 07:50:25', '34561278', 'Mombasa, Kenya', 'Married', '41117 - 80100', 'Khlasa Road, Tudor, Mombasa', 'ICT Officer II', 'Department of Finance, Economic Planning and Digital Transformation', 'Contract'),
(2, '12345678910', 'Doe', 'John', 'Ali', 'jsgv505@gmail.com', '0700191407', '1998-01-01', '$2a$10$1fbc235b0P0xFPEyLlLCtOAJzhYWeqv1A75u3VZzz0.x5aEE6D/mi', 1, '2025-09-20 05:54:11', '2025-09-20 07:38:05', '12345678', 'Mombasa, Kenya', 'Married', '41117 - 80100', 'Khlasa Road, Tudor, Mombasa', 'ICT Officer II', 'Department of Finance, Economic Planning and Digital Transformation', 'Permanent');

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `children`
--
ALTER TABLE `children`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `declarations`
--
ALTER TABLE `declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `financial_declarations`
--
ALTER TABLE `financial_declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `spouses`
--
ALTER TABLE `spouses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

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
