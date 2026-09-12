import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { bindToVehicle, decodeVin, matchesVehicle, openRecalls, vinQuery } from './vehicle'

const CLEAN = {
	Results: [
		{
			ErrorCode: '0',
			VIN: '1HGCM82633A004352',
			Make: 'HONDA',
			Model: 'Accord',
			ModelYear: '2003',
			VehicleType: 'PASSENGER CAR',
			Manufacturer: 'AMERICAN HONDA MOTOR CO., INC.',
			PlantCountry: 'UNITED STATES (USA)',
		},
	],
}
const MALFORMED = { Results: [{ ErrorCode: '6,7,400', Make: '', Model: '', ModelYear: '' }] }

const CLAIM = {
	claimType: ClaimType.Equipment,
	debtorTaxId: '900123456',
	invoiceNumber: '1HGCM82633A004352',
	amountMinor: '1850000',
	currency: 'USD',
	dueDate: '2028-03-31',
	issuerTaxId: '811004321',
	country: 'US',
}

// Measured against the live register: a malformed vin comes back 200 with an error string and empty
// fields, so checking the status code proves nothing. ErrorCode '0' is the only clean decode.
test('a clean decode is told apart from a refused one', () => {
	expect(decodeVin(CLEAN).exists).toBe(true)
	expect(decodeVin(CLEAN).make).toBe('HONDA')
	expect(decodeVin(CLEAN).manufacturer).toBe('AMERICAN HONDA MOTOR CO., INC.')
	expect(decodeVin(MALFORMED).exists).toBe(false)
	expect(decodeVin(MALFORMED).make).toBeUndefined()
	expect(decodeVin({ Results: [] }).exists).toBe(false)
})

// The vin reaches a path segment. Anything outside the shape a vin has is refused here rather than
// escaped and trusted to stay escaped through every later edit.
test('a vin outside its shape never reaches the url', () => {
	expect(vinQuery('1HGCM82633A004352')).toBe('1HGCM82633A004352')
	expect(() => vinQuery('1HGCM82633A00435')).toThrow(/vin/)
	expect(() => vinQuery('../../etc/passwd')).toThrow(/vin/)
	expect(() => vinQuery('1HGCM82633A00435I')).toThrow(/vin/)
})

// The declared vehicle has to be the decoded vehicle. Without this the enclave would confirm that
// SOME vehicle exists while the claim described another one — the same evasion bindToLedger closes.
test('the claim is bound to what the register returned', () => {
	const decoded = decodeVin(CLEAN)
	expect(bindToVehicle(CLAIM, decoded)?.debtorTaxId).toBe(CLAIM.debtorTaxId)
	expect(bindToVehicle(CLAIM, decoded)?.country).toBe('US')
	expect(bindToVehicle(CLAIM, decodeVin(MALFORMED))).toBeUndefined()
})

// The register echoes the number it decoded, and that is what is compared — not the number that was
// sent. Comparing the claim against itself passes for any vehicle, which is the evasion being
// closed: attesting that SOME vehicle exists while the claim described another.
test('the echoed vin is matched against the claim, not the claim against itself', () => {
	expect(matchesVehicle(decodeVin(CLEAN), CLAIM)).toBe(true)
	expect(matchesVehicle(decodeVin(CLEAN), { ...CLAIM, invoiceNumber: '5YJ3E1EA7KF317000' })).toBe(false)
	expect(matchesVehicle(decodeVin(MALFORMED), CLAIM)).toBe(false)
	// A register that answered cleanly about a different vehicle must not pass either.
	const elsewhere = { Results: [{ ...CLEAN.Results[0], VIN: '5YJ3E1EA7KF317000' }] }
	expect(matchesVehicle(decodeVin(elsewhere), CLAIM)).toBe(false)
})

// The count is what matters, and zero is a real answer rather than a missing one: an asset with
// open safety recalls is worth less as collateral, and an unanswerable check is not a clean one.
test('the recall count is read, and absent is not zero', () => {
	expect(openRecalls({ Count: 24, results: [] })).toBe(24)
	expect(openRecalls({ Count: 0, results: [] })).toBe(0)
	expect(openRecalls({})).toBeUndefined()
})
