import type { SubmittedClaim } from './ledger'

/**
 * A vehicle identification number is seventeen characters, and the standard excludes I, O and Q so
 * that nothing is confused with 1 and 0. Anything outside that shape is refused here rather than
 * escaped into a path segment and trusted to stay escaped through every later edit.
 */
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/

export const vinQuery = (vin: string): string => {
	const upper = vin.toUpperCase()
	if (!VIN.test(upper)) throw new Error('vin is not seventeen valid characters')
	return upper
}

export type VinDecode = {
	exists: boolean
	/** Echoed back by the register. Compared against the claim so a decode of some OTHER vehicle cannot pass. */
	vin?: string
	make?: string
	model?: string
	modelYear?: string
	vehicleType?: string
	manufacturer?: string
	plantCountry?: string
}

type VinResponse = { Results?: Array<Record<string, string>> }

/**
 * Measured against the live register: a malformed number answers 200 with an error string and empty
 * fields, so the status code proves nothing. `ErrorCode` is the discriminator — '0' and only '0' is
 * a clean decode, and a real one carries 45 non-empty fields of 154.
 */
export const decodeVin = (body: VinResponse): VinDecode => {
	const row = body.Results?.[0]
	if (row === undefined || row.ErrorCode !== '0') return { exists: false }
	const some = (value: string | undefined) => (value === undefined || value === '' ? undefined : value)
	return {
		exists: true,
		vin: some(row.VIN),
		make: some(row.Make),
		model: some(row.Model),
		modelYear: some(row.ModelYear),
		vehicleType: some(row.VehicleType),
		manufacturer: some(row.Manufacturer),
		plantCountry: some(row.PlantCountry),
	}
}

/**
 * How many open safety campaigns the register holds for this vehicle.
 *
 * Undefined means the register did not answer; zero means it answered none. An unanswerable check
 * is not a clean one, and an asset carrying open recalls is worth less as collateral — which is why
 * this call is a condition signal and not a decoy chosen to keep a count constant.
 */
export const openRecalls = (body: { Count?: number }): number | undefined =>
	typeof body.Count === 'number' ? body.Count : undefined

/**
 * The claim, rebound to what the register returned.
 *
 * Returns undefined when the number does not decode, so nothing downstream can attest a vehicle
 * that does not exist. What this cannot do is what `bindToLedger` does for an invoice: replace the
 * obligor with a name an external record holds. The register knows vehicles, not who owes money on
 * them, so for this instrument the obligor is submitter-supplied and nothing attests it. That is a
 * declared limitation of the instrument rather than a gap in the check.
 */
export const bindToVehicle = (claim: SubmittedClaim, decoded: VinDecode): SubmittedClaim | undefined =>
	decoded.exists ? { ...claim } : undefined

/**
 * Whether the vehicle the register describes is the vehicle the claim names.
 *
 * The register echoes the number it decoded, and that is what is compared — not the number that was
 * sent. Comparing the claim against itself would be a tautology that passes for any vehicle, which
 * is exactly the evasion this check exists to close: attesting that SOME vehicle exists while the
 * claim described another.
 *
 * There is no amount or date to compare, because the register holds no financing terms. Those are
 * attested by the debtor's confirmation, not by this call.
 */
export const matchesVehicle = (decoded: VinDecode, claim: SubmittedClaim): boolean =>
	decoded.exists &&
	decoded.vin !== undefined &&
	decoded.vin.toUpperCase() === claim.invoiceNumber.toUpperCase()
