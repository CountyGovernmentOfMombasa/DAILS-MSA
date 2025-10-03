-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 03, 2025 at 11:10 AM
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
-- Table structure for table `declarations`
--

CREATE TABLE `declarations` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `marital_status` enum('single','married','divorced','widowed','separated') NOT NULL,
  `declaration_date` date NOT NULL,
  `period_start_date` date DEFAULT NULL,
  `period_end_date` date DEFAULT NULL,
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
  `declaration_type` enum('First','Biennial','Final') DEFAULT 'Biennial',
  `submitted_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `declarations`
--

INSERT INTO `declarations` (`id`, `user_id`, `marital_status`, `declaration_date`, `period_start_date`, `period_end_date`, `biennial_income`, `assets`, `liabilities`, `other_financial_info`, `signature_path`, `witness_signed`, `witness_name`, `witness_address`, `witness_phone`, `created_at`, `updated_at`, `status`, `correction_message`, `declaration_type`, `submitted_at`) VALUES
(42, 1, 'married', '0000-00-00', '2025-01-01', '2025-12-31', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, '2025-10-03 08:50:34', '2025-10-03 08:50:35', 'pending', NULL, 'Biennial', '2025-10-03 11:50:34'),
(43, 2, 'single', '2025-10-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, '2025-10-03 08:50:35', '2025-10-03 08:50:35', 'pending', NULL, 'Biennial', '2025-10-03 11:50:35'),
(44, 88, 'single', '2025-11-05', NULL, NULL, '[{\"type\":\"Salary\",\"description\":\"Net salary\",\"value\":\"1000\"}]', '[]', '[]', NULL, NULL, 1, 'Observer One', '123 Street', '+254700000000', '2025-10-03 08:58:25', '2025-10-03 08:58:25', 'pending', NULL, 'Biennial', '2025-10-03 11:58:25'),
(45, 77, 'single', '2025-10-01', '2025-01-01', '2025-12-31', '[]', '[]', '[]', NULL, NULL, 0, NULL, NULL, NULL, '2025-10-03 08:58:28', '2025-10-03 08:58:28', 'pending', NULL, 'First', '2025-10-03 11:58:28'),
(46, 17948, 'married', '2025-10-03', '2024-01-01', '2024-12-31', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"1000000\"}]', '[{\"type\":\"Car\",\"description\":\"\",\"value\":\"1000000\",\"make\":\"Toyota\",\"model\":\"Axio\",\"licence_no\":\"KDC763V\"}]', '[{\"type\":\"Current Liabilities (Short-Term)\",\"description\":\"Short-Term Loans\",\"value\":\"100000\"},{\"type\":\"Non-Current Liabilities (Long-Term)\",\"description\":\"Long-Term Loans\",\"value\":\"200000\"}]', 'Car is partially owned by Mogo.', NULL, NULL, NULL, NULL, NULL, '2025-10-03 09:05:12', '2025-10-03 09:05:12', 'pending', NULL, 'First', '2025-10-03 12:05:12'),
(47, 17948, 'married', '2025-10-03', '2024-01-01', '2024-12-31', '[{\"type\":\"Salary\",\"description\":\"From Work\",\"value\":\"1000000\"}]', '[{\"type\":\"Car\",\"description\":\"\",\"value\":\"1000000\",\"make\":\"Toyota\",\"model\":\"Axio\",\"licence_no\":\"KDC763V\"}]', '[{\"type\":\"Current Liabilities (Short-Term)\",\"description\":\"Short-Term Loans\",\"value\":\"100000\"},{\"type\":\"Non-Current Liabilities (Long-Term)\",\"description\":\"Long-Term Loans\",\"value\":\"200000\"}]', 'Car is partially owned by Mogo.', NULL, NULL, NULL, NULL, NULL, '2025-10-03 09:05:12', '2025-10-03 09:05:12', 'pending', NULL, 'First', '2025-10-03 12:05:12');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `declarations`
--
ALTER TABLE `declarations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_declarations_user` (`user_id`),
  ADD KEY `idx_declarations_date` (`declaration_date`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `declarations`
--
ALTER TABLE `declarations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `declarations`
--
ALTER TABLE `declarations`
  ADD CONSTRAINT `declarations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
