import { createHmac, randomInt } from "crypto";

/**
 * Function that generates an access token hash
 * @param secretKey used to sign the access token
 * @param amount the amount that is being requested
 * @param expiredAt date when the access token will expire
 * @returns access token hash
 */
export const generateAccessToken = (params: {
  expiredAt: Date;
  amount: bigint;
  secretKey: string;
}): string => {
  const createdAt = new Date(Date.now());
  const message = {
    entropy: randomInt(1e6),
    createdAt: createdAt.valueOf(),
    expiredAt: params.expiredAt.valueOf(),
    amount: params.amount,
  };
  const accessToken = createHmac("sha256", params.secretKey)
    .update(JSON.stringify(message))
    .digest("base64");
  return accessToken;
};
