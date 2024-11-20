import jwt from 'jsonwebtoken';
import envVarsConfig from '../../../src/config';

export default function getMocks() {
  const uniqueCode = {
    techCult: {
      codes: {
        elegible: '5tb_redeem_code', //REDEEMED: FALSE
        nonElegible: '2tb_code_redeem', //REDEEMED: TRUE
        doesntExist: 'doesnt_exist',
      },
      provider: 'TECHCULT',
    },
    stackCommerce: {
      codes: {
        elegible: '5tb_redeem_code', //REDEEMED: FALSE
        nonElegible: '2tb_code_redeem', //REDEEMED: TRUE
        doesntExist: 'doesnt_exist',
      },
      provider: 'STACKCOMMERCE',
    },
  };

  const preventCancellationTestUsers = {
    nonElegible: {
      lifetimeUserUuid: 'ee4f8abf-397c-4558-b794-a675a4bed2d7',
      subscriptionUserUuid: '48cef034-011b-4e75-9671-86928a2370e7',
    },
    elegible: {
      subscriptionUserUuid: '223b88d7-f5a0-4592-a76c-22758c074757',
    },
  };

  const testPlansId = {
    subscription: {
      exists: 'price_1PLMh8FAOdcgaBMQlZcGAPY4',
      doesNotExist: 'price_1PLMerFAOdcgaBMQ17q27Cas',
    },
    lifetime: {
      exists: 'price_1PLMTpFAOdcgaBMQ0Jag685H',
      doesNotExist: 'price_1PLMVCFAOdcgaBMQxIQgdXsds',
    },
  };

  function getValidToken(userUuid: string): string {
    return jwt.sign({ payload: { uuid: userUuid } }, envVarsConfig.JWT_SECRET);
  }
  return {
    getValidToken,
    preventCancellationTestUsers,
    uniqueCode,
    validToken:
      // eslint-disable-next-line max-len
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7InV1aWQiOiJiODQyODk3YS01MDg2LTQxODMtYWZiMS1mYTAwNGVlMzljNjYiLCJlbWFpbCI6InByZXBheW1lbnRzbGF1bmNoQGlueHQuY29tIiwibmFtZSI6ImhlbGxvIiwibGFzdG5hbWUiOiJoZWxsbyIsInVzZXJuYW1lIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJzaGFyZWRXb3Jrc3BhY2UiOnRydWUsIm5ldHdvcmtDcmVkZW50aWFscyI6eyJ1c2VyIjoicHJlcGF5bWVudHNsYXVuY2hAaW54dC5jb20iLCJwYXNzIjoiJDJhJDA4JFRRSmppNS9wUHpWUlp0UWNxOW9hd3VsdEFUYUlMTjdlUHNjWHg2Vy95WDhzNGJyM1FtOWJtIn19LCJpYXQiOjE2NTUxMDQwOTZ9.s3791sv4gmWgt5Ni1a8DnRw_5JyJ8g9Ff0bpIlqo6LM',
    testPlansId,
  };
}
