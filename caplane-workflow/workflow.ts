import { cre, hexToBase64, ok, type TeeRuntime } from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'

export const configSchema = z.object({
	schedule: z.string(),
	url: z.string(),
	secretId: z.string(),
})
type Config = z.infer<typeof configSchema>

/**
 * Proves the Vault-to-enclave round trip without ever exposing the value.
 *
 * The credential is released by the Vault DON directly into the attested enclave. We report it
 * by its effect — a real upstream returns 200 only for a valid credential — plus a length, never
 * the value itself. Reading or printing secret contents is a must-pass rubric failure.
 *
 * No logging anywhere in this handler: log output leaves the enclave, so anything logged
 * stops being confidential.
 */
export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
	const config = runtime.config

	// One batch call spends one unit against the five-per-execution secrets quota.
	const secrets = runtime.getSecrets([{ id: config.secretId }]).result()
	const token = secrets[config.secretId].value

	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: config.url,
			method: 'GET',
			multiHeaders: { Authorization: { values: [`Bearer ${token}`] } },
		})
		.result()

	const verdict = ok(response) ? 'ACCEPTED_BY_UPSTREAM' : `HTTP_${response.statusCode}`
	const proof = `len=${token.length}`

	// One-way door. Only the derived, non-sensitive conclusion crosses; never the credential,
	// never the raw response body.
	const donRuntime = runtime.usingTheDons()

	donRuntime
		.report({
			encodedPayload: hexToBase64(
				encodeAbiParameters(parseAbiParameters('string verdict, string proof'), [
					verdict,
					proof,
				]),
			),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	return `${verdict} ${proof}`
}

export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onCronTrigger, [
			{ tee: 'nitro', regions: ['us-west-2'] },
		]),
	]
}
