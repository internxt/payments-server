db.createUser({
  user: 'admin',
  pwd: 'password',
  roles: [
    {
      role: 'readWrite',
      db: 'payments',
    },
  ],
});

db.createCollection('users');
db.users.createIndex(
  {
    uuid: 1,
  },
  {
    unique: true,
  },
);

db.users.createIndex(
  {
    customer_id: 1,
  },
  {
    unique: true,
  },
);

db.createCollection('tiers');
db.tiers.insertMany([
  {
    _id: ObjectId('6762da736552a0491488eb31'),
    label: 'essential',
    productId: 'prod_RnMnlXOrOPK1T9',
    billingType: 'subscription',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('1099511627776'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: false,
        paxPerCall: 0,
      },
      mail: {
        enabled: false,
        addressesPerUser: 0,
      },
      vpn: {
        enabled: true,
        featureId: 'c9534015-dfa0-41df-8c0c-e93812fa2c1f',
      },
    },
  },
  {
    _id: ObjectId('6762ddc6a04586ae610e397c'),
    label: 'free',
    productId: 'free',
    billingType: 'none',
    featuresPerService: {
      antivirus: {
        enabled: false,
      },
      backups: {
        enabled: false,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: 1073741824,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: false,
        paxPerCall: 0,
      },
      mail: {
        enabled: false,
        addressesPerUser: 0,
      },
      vpn: {
        enabled: true,
        locationsAvailable: 1,
      },
    },
  },
  {
    _id: ObjectId('6762defaa04586ae610e5bec'),
    label: 'premium',
    productId: 'prod_RnMqzlDQjdNi3D',
    billingType: 'subscription',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('3298534883328'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 3,
      },
      mail: {
        enabled: true,
        addressesPerUser: 3,
      },
      vpn: {
        enabled: true,
        featureId: '6d06f11b-9854-49db-a38b-56ca4aab1658',
      },
    },
  },
  {
    _id: ObjectId('6762df9ca04586ae610e6ddc'),
    label: 'ultimate',
    productId: 'prod_RnMs7RSt2Is2KE',
    billingType: 'subscription',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('5497558138880'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 5,
      },
      mail: {
        enabled: true,
        addressesPerUser: 5,
      },
      vpn: {
        enabled: true,
        featureId: '8efbba36-f3a1-4cf2-8f70-29326fab54f4',
      },
    },
  },
  {
    _id: ObjectId('6762ec76a04586ae610fd758'),
    label: 'business-standard',
    productId: 'prod_QSIpZDVYVLVil1',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('1099511627776'),
        workspaces: {
          enabled: true,
          minimumSeats: 0,
          maximumSeats: 0,
          maxSpaceBytesPerSeat: NumberLong('1099511627776'),
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 5,
      },
      mail: {
        enabled: true,
        addressesPerUser: 1,
      },
      vpn: {
        enabled: true,
        featureId: 'cd4f81a4-6c51-4991-b24f-7219dfbbadfd',
      },
    },
  },
  {
    _id: ObjectId('6762ecc5a04586ae610fe029'),
    label: 'essential',
    productId: 'prod_RnMnlXOrOPK1T9',
    billingType: 'lifetime',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('1099511627776'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: false,
        paxPerCall: 0,
      },
      mail: {
        enabled: false,
        addressesPerUser: 0,
      },
      vpn: {
        enabled: true,
        featureId: 'c9534015-dfa0-41df-8c0c-e93812fa2c1f',
      },
    },
  },
  {
    _id: ObjectId('6762ed4ba04586ae610feea4'),
    label: 'premium',
    productId: 'prod_RnMqzlDQjdNi3D',
    billingType: 'lifetime',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('3298534883328'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 3,
      },
      mail: {
        enabled: true,
        addressesPerUser: 3,
      },
      vpn: {
        enabled: true,
        featureId: '6d06f11b-9854-49db-a38b-56ca4aab1658',
      },
    },
  },
  {
    _id: ObjectId('6762ed97a04586ae610ff753'),
    label: 'ultimate',
    productId: 'prod_RnMs7RSt2Is2KE',
    billingType: 'lifetime',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('5497558138880'),
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 5,
      },
      mail: {
        enabled: true,
        addressesPerUser: 5,
      },
      vpn: {
        enabled: true,
        featureId: '8efbba36-f3a1-4cf2-8f70-29326fab54f4',
      },
    },
  },
  {
    _id: ObjectId('67c016bdcacd38a9cdfe8fd6'),
    label: 'business-pro',
    productId: 'prod_QSIkFOC1iCrHAd',
    featuresPerService: {
      antivirus: {
        enabled: true,
      },
      backups: {
        enabled: true,
      },
      drive: {
        enabled: true,
        maxSpaceBytes: NumberLong('2199023255552'),
        workspaces: {
          enabled: true,
          minimumSeats: 0,
          maximumSeats: 0,
          maxSpaceBytesPerSeat: NumberLong('2199023255552'),
        },
      },
      meet: {
        enabled: true,
        paxPerCall: 5,
      },
      mail: {
        enabled: true,
        addressesPerUser: 1,
      },
      vpn: {
        enabled: true,
        featureId: '1b3d5f0a-459b-4189-84b9-29933fba1aa0',
      },
    },
  },
]);

db.createCollection('products');
db.products.insertMany([
  {
    _id: ObjectId('66b5c40fa095e0fe64238e7e'),
    paymentGatewayId: 'prod_QSIkFOC1iCrHAd',
    userType: 'business',
  },
  {
    _id: ObjectId('66b5c45fa095e0fe64238e80'),
    paymentGatewayId: 'prod_QSIpZDVYVLVil1',
    userType: 'business',
  },
]);
