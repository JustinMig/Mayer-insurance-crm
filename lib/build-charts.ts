export type MutualOfOmahaBuildRow = {
  feet: number
  inches: number
  height: string
  minimumWeight: number
  maximumWeight: number
}


export type PhysiciansMutualBuildRow = {
  feet: number
  inches: number
  height: string
  minimumWeight: number
  maximumWeight: number
}

export type CorebridgeBuildRow = {
  feet: number
  inches: number
  height: string
  legacyMinimumWeight: number
  legacyMaximumWeight: number
  maxMinimumWeight: number
  maxMaximumWeight: number
}

export type AmericanAmicableBuildRow = {
  feet: number
  inches: number
  height: string
  maximumImmediate: string
  maximumGraded: string
  maximumRop: string
  minimumImmediate: string
  minimumRop: string
  homeOfficeReferral?: boolean
}

// Source: Mutual of Omaha underwriting guide, PDF page 28 only.
// The DI Rider Maximum Weight column is intentionally excluded per CRM requirements.
export const MUTUAL_OF_OMAHA_BUILD: MutualOfOmahaBuildRow[] = [
  { feet: 4, inches: 8, height: `4' 8\"`, minimumWeight: 74, maximumWeight: 197 },
  { feet: 4, inches: 9, height: `4' 9\"`, minimumWeight: 77, maximumWeight: 202 },
  { feet: 4, inches: 10, height: `4' 10\"`, minimumWeight: 79, maximumWeight: 208 },
  { feet: 4, inches: 11, height: `4' 11\"`, minimumWeight: 82, maximumWeight: 214 },
  { feet: 5, inches: 0, height: `5'`, minimumWeight: 85, maximumWeight: 220 },
  { feet: 5, inches: 1, height: `5' 1\"`, minimumWeight: 88, maximumWeight: 226 },
  { feet: 5, inches: 2, height: `5' 2\"`, minimumWeight: 91, maximumWeight: 232 },
  { feet: 5, inches: 3, height: `5' 3\"`, minimumWeight: 94, maximumWeight: 238 },
  { feet: 5, inches: 4, height: `5' 4\"`, minimumWeight: 97, maximumWeight: 245 },
  { feet: 5, inches: 5, height: `5' 5\"`, minimumWeight: 100, maximumWeight: 251 },
  { feet: 5, inches: 6, height: `5' 6\"`, minimumWeight: 103, maximumWeight: 258 },
  { feet: 5, inches: 7, height: `5' 7\"`, minimumWeight: 106, maximumWeight: 265 },
  { feet: 5, inches: 8, height: `5' 8\"`, minimumWeight: 109, maximumWeight: 274 },
  { feet: 5, inches: 9, height: `5' 9\"`, minimumWeight: 112, maximumWeight: 282 },
  { feet: 5, inches: 10, height: `5' 10\"`, minimumWeight: 115, maximumWeight: 289 },
  { feet: 5, inches: 11, height: `5' 11\"`, minimumWeight: 119, maximumWeight: 298 },
  { feet: 6, inches: 0, height: `6'`, minimumWeight: 122, maximumWeight: 305 },
  { feet: 6, inches: 1, height: `6' 1\"`, minimumWeight: 126, maximumWeight: 313 },
  { feet: 6, inches: 2, height: `6' 2\"`, minimumWeight: 129, maximumWeight: 321 },
  { feet: 6, inches: 3, height: `6' 3\"`, minimumWeight: 133, maximumWeight: 329 },
  { feet: 6, inches: 4, height: `6' 4\"`, minimumWeight: 136, maximumWeight: 338 },
  { feet: 6, inches: 5, height: `6' 5\"`, minimumWeight: 140, maximumWeight: 347 },
  { feet: 6, inches: 6, height: `6' 6\"`, minimumWeight: 143, maximumWeight: 358 },
  { feet: 6, inches: 7, height: `6' 7\"`, minimumWeight: 147, maximumWeight: 367 },
  { feet: 6, inches: 8, height: `6' 8\"`, minimumWeight: 151, maximumWeight: 376 },
  { feet: 6, inches: 9, height: `6' 9\"`, minimumWeight: 154, maximumWeight: 385 },
  { feet: 6, inches: 10, height: `6' 10\"`, minimumWeight: 158, maximumWeight: 395 }
]

// Source: American Amicable Senior Choice guide, PDF page 13 only (printed page 14).
// Values are preserved exactly as shown in the source chart.
export const AMERICAN_AMICABLE_BUILD: AmericanAmicableBuildRow[] = [
  { feet: 4, inches: 5, height: `4' 5\"`, maximumImmediate: '173', maximumGraded: '174-180', maximumRop: '181-190', minimumImmediate: '82', minimumRop: '77-81', homeOfficeReferral: true },
  { feet: 4, inches: 6, height: `4' 6\"`, maximumImmediate: '180', maximumGraded: '182-188', maximumRop: '189-198', minimumImmediate: '84', minimumRop: '79-83', homeOfficeReferral: true },
  { feet: 4, inches: 7, height: `4' 7\"`, maximumImmediate: '187', maximumGraded: '189-196', maximumRop: '197-206', minimumImmediate: '86', minimumRop: '81-85', homeOfficeReferral: true },
  { feet: 4, inches: 8, height: `4' 8\"`, maximumImmediate: '197', maximumGraded: '198-204', maximumRop: '205-214', minimumImmediate: '88', minimumRop: '83-87' },
  { feet: 4, inches: 9, height: `4' 9\"`, maximumImmediate: '204', maximumGraded: '205-212', maximumRop: '213-222', minimumImmediate: '90', minimumRop: '85-89' },
  { feet: 4, inches: 10, height: `4' 10\"`, maximumImmediate: '211', maximumGraded: '212-220', maximumRop: '221-230', minimumImmediate: '92', minimumRop: '87-91' },
  { feet: 4, inches: 11, height: `4' 11\"`, maximumImmediate: '218', maximumGraded: '219-228', maximumRop: '229-238', minimumImmediate: '94', minimumRop: '89-93' },
  { feet: 5, inches: 0, height: `5'`, maximumImmediate: '225', maximumGraded: '226-236', maximumRop: '237-246', minimumImmediate: '96', minimumRop: '91-95' },
  { feet: 5, inches: 1, height: `5' 1\"`, maximumImmediate: '233', maximumGraded: '234-244', maximumRop: '245-254', minimumImmediate: '99', minimumRop: '94-98' },
  { feet: 5, inches: 2, height: `5' 2\"`, maximumImmediate: '241', maximumGraded: '242-252', maximumRop: '253-262', minimumImmediate: '101', minimumRop: '96-100' },
  { feet: 5, inches: 3, height: `5' 3\"`, maximumImmediate: '248', maximumGraded: '249-260', maximumRop: '261-271', minimumImmediate: '105', minimumRop: '100-104' },
  { feet: 5, inches: 4, height: `5' 4\"`, maximumImmediate: '256', maximumGraded: '257-268', maximumRop: '269-280', minimumImmediate: '107', minimumRop: '102-106' },
  { feet: 5, inches: 5, height: `5' 5\"`, maximumImmediate: '264', maximumGraded: '265-276', maximumRop: '277-288', minimumImmediate: '110', minimumRop: '105-109' },
  { feet: 5, inches: 6, height: `5' 6\"`, maximumImmediate: '273', maximumGraded: '274-285', maximumRop: '286-297', minimumImmediate: '112', minimumRop: '107-111' },
  { feet: 5, inches: 7, height: `5' 7\"`, maximumImmediate: '281', maximumGraded: '282-294', maximumRop: '295-306', minimumImmediate: '116', minimumRop: '111-115' },
  { feet: 5, inches: 8, height: `5' 8\"`, maximumImmediate: '289', maximumGraded: '290-303', maximumRop: '304-316', minimumImmediate: '119', minimumRop: '114-118' },
  { feet: 5, inches: 9, height: `5' 9\"`, maximumImmediate: '298', maximumGraded: '299-312', maximumRop: '313-325', minimumImmediate: '123', minimumRop: '118-122' },
  { feet: 5, inches: 10, height: `5' 10\"`, maximumImmediate: '307', maximumGraded: '308-321', maximumRop: '322-335', minimumImmediate: '126', minimumRop: '121-125' },
  { feet: 5, inches: 11, height: `5' 11\"`, maximumImmediate: '315', maximumGraded: '316-330', maximumRop: '331-344', minimumImmediate: '131', minimumRop: '126-130' },
  { feet: 6, inches: 0, height: `6'`, maximumImmediate: '324', maximumGraded: '325-339', maximumRop: '340-354', minimumImmediate: '135', minimumRop: '130-134' },
  { feet: 6, inches: 1, height: `6' 1\"`, maximumImmediate: '334', maximumGraded: '335-349', maximumRop: '350-364', minimumImmediate: '139', minimumRop: '134-138' },
  { feet: 6, inches: 2, height: `6' 2\"`, maximumImmediate: '343', maximumGraded: '344-359', maximumRop: '360-374', minimumImmediate: '142', minimumRop: '137-141' },
  { feet: 6, inches: 3, height: `6' 3\"`, maximumImmediate: '352', maximumGraded: '353-368', maximumRop: '369-384', minimumImmediate: '146', minimumRop: '141-145' },
  { feet: 6, inches: 4, height: `6' 4\"`, maximumImmediate: '361', maximumGraded: '362-378', maximumRop: '379-394', minimumImmediate: '149', minimumRop: '144-148' },
  { feet: 6, inches: 5, height: `6' 5\"`, maximumImmediate: '370', maximumGraded: '371-388', maximumRop: '389-404', minimumImmediate: '152', minimumRop: '147-151' },
  { feet: 6, inches: 6, height: `6' 6\"`, maximumImmediate: '379', maximumGraded: '380-398', maximumRop: '399-414', minimumImmediate: '156', minimumRop: '151-155' },
  { feet: 6, inches: 7, height: `6' 7\"`, maximumImmediate: '388', maximumGraded: '398-408', maximumRop: '409-424', minimumImmediate: '160', minimumRop: '155-159' },
  { feet: 6, inches: 8, height: `6' 8\"`, maximumImmediate: '397', maximumGraded: '398-418', maximumRop: '419-434', minimumImmediate: '164', minimumRop: '159-163' },
  { feet: 6, inches: 9, height: `6' 9\"`, maximumImmediate: '406', maximumGraded: '407-428', maximumRop: '429-440', minimumImmediate: '168', minimumRop: '162-167' }
]

// Source: Physicians Life Insurance Company Product & Underwriting Guidelines
// for Secure Essential Life Insurance (L780), revised 05/11/2026, PDF page 8 only.
// Applicants below the minimum or above the maximum are not eligible for coverage.
export const PHYSICIANS_MUTUAL_BUILD: PhysiciansMutualBuildRow[] = [
  { feet: 4, inches: 8, height: `4' 8\"`, minimumWeight: 83, maximumWeight: 182 },
  { feet: 4, inches: 9, height: `4' 9\"`, minimumWeight: 86, maximumWeight: 189 },
  { feet: 4, inches: 10, height: `4' 10\"`, minimumWeight: 89, maximumWeight: 196 },
  { feet: 4, inches: 11, height: `4' 11\"`, minimumWeight: 92, maximumWeight: 203 },
  { feet: 5, inches: 0, height: `5'`, minimumWeight: 95, maximumWeight: 209 },
  { feet: 5, inches: 1, height: `5' 1\"`, minimumWeight: 98, maximumWeight: 217 },
  { feet: 5, inches: 2, height: `5' 2\"`, minimumWeight: 102, maximumWeight: 224 },
  { feet: 5, inches: 3, height: `5' 3\"`, minimumWeight: 105, maximumWeight: 231 },
  { feet: 5, inches: 4, height: `5' 4\"`, minimumWeight: 108, maximumWeight: 238 },
  { feet: 5, inches: 5, height: `5' 5\"`, minimumWeight: 112, maximumWeight: 246 },
  { feet: 5, inches: 6, height: `5' 6\"`, minimumWeight: 115, maximumWeight: 254 },
  { feet: 5, inches: 7, height: `5' 7\"`, minimumWeight: 119, maximumWeight: 261 },
  { feet: 5, inches: 8, height: `5' 8\"`, minimumWeight: 122, maximumWeight: 269 },
  { feet: 5, inches: 9, height: `5' 9\"`, minimumWeight: 126, maximumWeight: 277 },
  { feet: 5, inches: 10, height: `5' 10\"`, minimumWeight: 129, maximumWeight: 285 },
  { feet: 5, inches: 11, height: `5' 11\"`, minimumWeight: 133, maximumWeight: 294 },
  { feet: 6, inches: 0, height: `6'`, minimumWeight: 137, maximumWeight: 302 },
  { feet: 6, inches: 1, height: `6' 1\"`, minimumWeight: 141, maximumWeight: 310 },
  { feet: 6, inches: 2, height: `6' 2\"`, minimumWeight: 145, maximumWeight: 319 },
  { feet: 6, inches: 3, height: `6' 3\"`, minimumWeight: 149, maximumWeight: 328 },
  { feet: 6, inches: 4, height: `6' 4\"`, minimumWeight: 152, maximumWeight: 336 },
  { feet: 6, inches: 5, height: `6' 5\"`, minimumWeight: 157, maximumWeight: 345 },
  { feet: 6, inches: 6, height: `6' 6\"`, minimumWeight: 161, maximumWeight: 354 },
  { feet: 6, inches: 7, height: `6' 7\"`, minimumWeight: 165, maximumWeight: 364 },
  { feet: 6, inches: 8, height: `6' 8\"`, minimumWeight: 169, maximumWeight: 373 },
  { feet: 6, inches: 9, height: `6' 9\"`, minimumWeight: 173, maximumWeight: 382 },
  { feet: 6, inches: 10, height: `6' 10\"`, minimumWeight: 177, maximumWeight: 392 },
  { feet: 6, inches: 11, height: `6' 11\"`, minimumWeight: 182, maximumWeight: 401 }
]


// Source: Corebridge Financial SimpliNow Legacy Underwriting Guide, AGLC201453 REV0424, PDF page 8.
// SimpliNow Legacy = Graded death benefit; SimpliNow Legacy Max = Level death benefit.
export const COREBRIDGE_SIMPLINOW_BUILD: CorebridgeBuildRow[] = [
  { feet: 4, inches: 8, height: `4' 8\"`, legacyMinimumWeight: 74, legacyMaximumWeight: 203, maxMinimumWeight: 79, maxMaximumWeight: 189 },
  { feet: 4, inches: 9, height: `4' 9\"`, legacyMinimumWeight: 77, legacyMaximumWeight: 210, maxMinimumWeight: 81, maxMaximumWeight: 196 },
  { feet: 4, inches: 10, height: `4' 10\"`, legacyMinimumWeight: 79, legacyMaximumWeight: 217, maxMinimumWeight: 84, maxMaximumWeight: 203 },
  { feet: 4, inches: 11, height: `4' 11\"`, legacyMinimumWeight: 82, legacyMaximumWeight: 225, maxMinimumWeight: 87, maxMaximumWeight: 210 },
  { feet: 5, inches: 0, height: `5'`, legacyMinimumWeight: 85, legacyMaximumWeight: 232, maxMinimumWeight: 90, maxMaximumWeight: 217 },
  { feet: 5, inches: 1, height: `5' 1\"`, legacyMinimumWeight: 88, legacyMaximumWeight: 240, maxMinimumWeight: 93, maxMaximumWeight: 224 },
  { feet: 5, inches: 2, height: `5' 2\"`, legacyMinimumWeight: 91, legacyMaximumWeight: 248, maxMinimumWeight: 96, maxMaximumWeight: 232 },
  { feet: 5, inches: 3, height: `5' 3\"`, legacyMinimumWeight: 94, legacyMaximumWeight: 256, maxMinimumWeight: 99, maxMaximumWeight: 239 },
  { feet: 5, inches: 4, height: `5' 4\"`, legacyMinimumWeight: 97, legacyMaximumWeight: 265, maxMinimumWeight: 103, maxMaximumWeight: 247 },
  { feet: 5, inches: 5, height: `5' 5\"`, legacyMinimumWeight: 100, legacyMaximumWeight: 273, maxMinimumWeight: 106, maxMaximumWeight: 255 },
  { feet: 5, inches: 6, height: `5' 6\"`, legacyMinimumWeight: 103, legacyMaximumWeight: 281, maxMinimumWeight: 109, maxMaximumWeight: 263 },
  { feet: 5, inches: 7, height: `5' 7\"`, legacyMinimumWeight: 106, legacyMaximumWeight: 290, maxMinimumWeight: 112, maxMaximumWeight: 271 },
  { feet: 5, inches: 8, height: `5' 8\"`, legacyMinimumWeight: 109, legacyMaximumWeight: 299, maxMinimumWeight: 116, maxMaximumWeight: 279 },
  { feet: 5, inches: 9, height: `5' 9\"`, legacyMinimumWeight: 112, legacyMaximumWeight: 307, maxMinimumWeight: 119, maxMaximumWeight: 287 },
  { feet: 5, inches: 10, height: `5' 10\"`, legacyMinimumWeight: 116, legacyMaximumWeight: 316, maxMinimumWeight: 123, maxMaximumWeight: 296 },
  { feet: 5, inches: 11, height: `5' 11\"`, legacyMinimumWeight: 119, legacyMaximumWeight: 326, maxMinimumWeight: 126, maxMaximumWeight: 304 },
  { feet: 6, inches: 0, height: `6'`, legacyMinimumWeight: 122, legacyMaximumWeight: 335, maxMinimumWeight: 130, maxMaximumWeight: 313 },
  { feet: 6, inches: 1, height: `6' 1\"`, legacyMinimumWeight: 126, legacyMaximumWeight: 344, maxMinimumWeight: 133, maxMaximumWeight: 321 },
  { feet: 6, inches: 2, height: `6' 2\"`, legacyMinimumWeight: 129, legacyMaximumWeight: 354, maxMinimumWeight: 137, maxMaximumWeight: 330 },
  { feet: 6, inches: 3, height: `6' 3\"`, legacyMinimumWeight: 133, legacyMaximumWeight: 363, maxMinimumWeight: 141, maxMaximumWeight: 339 },
  { feet: 6, inches: 4, height: `6' 4\"`, legacyMinimumWeight: 136, legacyMaximumWeight: 373, maxMinimumWeight: 145, maxMaximumWeight: 348 },
  { feet: 6, inches: 5, height: `6' 5\"`, legacyMinimumWeight: 140, legacyMaximumWeight: 383, maxMinimumWeight: 148, maxMaximumWeight: 358 },
  { feet: 6, inches: 6, height: `6' 6\"`, legacyMinimumWeight: 144, legacyMaximumWeight: 393, maxMinimumWeight: 152, maxMaximumWeight: 367 },
  { feet: 6, inches: 7, height: `6' 7\"`, legacyMinimumWeight: 147, legacyMaximumWeight: 403, maxMinimumWeight: 156, maxMaximumWeight: 376 },
  { feet: 6, inches: 8, height: `6' 8\"`, legacyMinimumWeight: 151, legacyMaximumWeight: 413, maxMinimumWeight: 160, maxMaximumWeight: 386 },
  { feet: 6, inches: 9, height: `6' 9\"`, legacyMinimumWeight: 155, legacyMaximumWeight: 424, maxMinimumWeight: 164, maxMaximumWeight: 396 },
  { feet: 6, inches: 10, height: `6' 10\"`, legacyMinimumWeight: 159, legacyMaximumWeight: 434, maxMinimumWeight: 168, maxMaximumWeight: 406 }
]
