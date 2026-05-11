import { describe, expect, test } from 'bun:test'
import {
  MAX_EMPLOYEE_IMPORT_CSV_BYTES,
  assertEmployeeImportCsvSize,
  parseGoogleAdminUsersCsv,
} from '../employee-import'

const SAMPLE_CSV = `First Name [Required],Last Name [Required],Email Address [Required],Password [Required],Password Hash Function [UPLOAD ONLY],Org Unit Path [Required],New Primary Email [UPLOAD ONLY],Status [READ ONLY],Last Sign In [READ ONLY],Recovery Email,Home Secondary Email,Work Secondary Email,Recovery Phone [MUST BE IN THE E.164 FORMAT],Work Phone,Home Phone,Mobile Phone,Work Address,Home Address,Employee ID,Employee Type,Employee Title,Manager Email,Department,Cost Center,2sv Enrolled [READ ONLY],2sv Enforced [READ ONLY],Building ID,Floor Name,Floor Section,Email Usage [READ ONLY],Drive Usage [READ ONLY],Photos Usage [READ ONLY],Storage limit [READ ONLY],Storage Used [READ ONLY],Change Password at Next Sign-In,New Status [UPLOAD ONLY],Gemini Limit Status [READ ONLY]
Adiella A.,Oktaviani,adiella.oktaviani@ahacommerce.net,****,,/,,Active,2026/04/10 04:05:20,,,,,,,+6281288118878,,,,,Senior Analyst,,Operations,,True,False,,,,0.3GB,2.49GB,0.0GB, --,2.78GB,False,,NOT_APPROACHING_LIMIT
"Comma, Name",User,comma.user@ahacommerce.net,****,,/,,Suspended,2026/04/10 04:05:20,,,,,,,+6200000000,"Some office, Jakarta",,,,,,,Finance,,False,False,,,,0.3GB,2.49GB,0.0GB, --,2.78GB,False,,-
`

describe('parseGoogleAdminUsersCsv', () => {
  test('maps Google Admin export columns to employee rows', () => {
    const rows = parseGoogleAdminUsersCsv(SAMPLE_CSV)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      fullName: 'Adiella A. Oktaviani',
      email: 'adiella.oktaviani@ahacommerce.net',
      status: 'Active',
      position: 'Senior Analyst',
      department: 'Operations',
      phone: '+6281288118878',
    })
  })

  test('supports quoted commas in cells', () => {
    const rows = parseGoogleAdminUsersCsv(SAMPLE_CSV)

    expect(rows[1]).toMatchObject({
      rowNumber: 3,
      firstName: 'Comma, Name',
      fullName: 'Comma, Name User',
      email: 'comma.user@ahacommerce.net',
      status: 'Suspended',
      phone: '+6200000000',
    })
  })
})

describe('assertEmployeeImportCsvSize', () => {
  test('rejects CSV files larger than the maximum size', () => {
    const oversizedCsv = 'a'.repeat(MAX_EMPLOYEE_IMPORT_CSV_BYTES + 1)
    expect(() => assertEmployeeImportCsvSize(oversizedCsv)).toThrow('CSV file is too large')
  })
})
