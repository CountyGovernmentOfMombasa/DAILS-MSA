// Test script to verify updateDeclaration controller functionality
// This would be run manually to test the API endpoint

const testData = {
    // Personal information
    surname: "Test",
    first_name: "User",
    other_names: "Middle",
    email: "test@example.com",
    marital_status: "married",
    payroll_number: "12345",
    birthdate: "1990-01-01",
    place_of_birth: "Test City",
    department: "IT",
    declaration_date: "2025-09-22",
    period_start_date: "2024-01-01",
    period_end_date: "2024-12-31",

    // Main financial data
    biennial_income: [
        { type: "salary", description: "Monthly Salary", value: 50000 },
        { type: "allowance", description: "Transport Allowance", value: 10000 }
    ],
    assets: "Property in Nairobi worth KSH 2,000,000",
    liabilities: "Bank loan KSH 500,000",
    other_financial_info: "No other financial information",

    // Spouses
    spouses: [
        {
            first_name: "Jane",
            other_names: "Mary",
            surname: "Doe",
            biennial_income: [
                { type: "business", description: "Small business income", value: 30000 }
            ],
            assets: "Shop worth KSH 300,000",
            liabilities: "No liabilities",
            other_financial_info: ""
        }
    ],

    // Children
    children: [
        {
            first_name: "John",
            other_names: "Junior",
            surname: "Test",
            biennial_income: [],
            assets: "Savings account KSH 50,000",
            liabilities: "",
            other_financial_info: "School fees paid by parents"
        }
    ],

    // Financial declarations (structured for financial_declarations table)
    financial_declarations: [
        {
            member_type: "user",
            member_name: "Test User Middle",
            declaration_date: "2025-09-22",
            period_start_date: "2024-01-01",
            period_end_date: "2024-12-31",
            biennial_income: [
                { type: "salary", description: "Monthly Salary", value: 50000 },
                { type: "allowance", description: "Transport Allowance", value: 10000 }
            ],
            assets: [
                { type: "real_estate", description: "Property in Nairobi", value: 2000000 }
            ],
            liabilities: [
                { type: "loan", description: "Bank loan", value: 500000 }
            ],
            other_financial_info: "No other financial information"
        },
        {
            member_type: "spouse",
            member_name: "Jane Mary Doe",
            declaration_date: "2025-09-22",
            period_start_date: "2024-01-01",
            period_end_date: "2024-12-31",
            biennial_income: [
                { type: "business", description: "Small business income", value: 30000 }
            ],
            assets: [
                { type: "business", description: "Shop", value: 300000 }
            ],
            liabilities: [],
            other_financial_info: ""
        }
    ],

    // Witness information
    witness_signed: true,
    witness_name: "Witness Name",
    witness_address: "Witness Address",
    witness_phone: "0700000000",
    declaration_checked: true
};

// Expected database structure after update:
/*
1. declarations table will have updated personal info and main financial data
2. spouses table will have spouse with full_name and JSON biennial_income
3. children table will have child with full_name and JSON biennial_income  
4. financial_declarations table will have 2 records (user, spouse)
5. financial_items table will have individual items for income/assets/liabilities
*/

console.log("Test data structure for updateDeclaration API:");
console.log(JSON.stringify(testData, null, 2));

module.exports = testData;