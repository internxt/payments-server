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
        foreignTierId: '47d76ff1-a6df-4334-a300-b11f50ea6bfd',
        maxSpaceBytes: 1099511627776,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: false,
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
      cleaner: {
        enabled: false,
      },
      cli: {
        enabled: false,
      },
      darkMonitor: {
        enabled: false,
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
        foreignTierId: 'f9a0c809-33b3-49b6-b8d3-957d95575bb2',
        enabled: true,
        maxSpaceBytes: 1073741824,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: false,
        },
        restrictedItemsSharing: {
          enabled: false,
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
        enabled: false,
      },
      cleaner: {
        enabled: false,
      },
      cli: {
        enabled: false,
      },
      darkMonitor: {
        enabled: false,
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
        foreignTierId: '899e07f7-0e8c-427b-9613-dee0c5c705a7',
        enabled: true,
        maxSpaceBytes: 3298534883328,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
        featureId: '6d06f11b-9854-49db-a38b-56ca4aab1658',
      },
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: false,
      },
      darkMonitor: {
        enabled: true,
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
        foreignTierId: '23bd8f2c-ae81-4f18-b18a-55a36e66547d',
        enabled: true,
        maxSpaceBytes: 5497558138880,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: true,
      },
      darkMonitor: {
        enabled: true,
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
        foreignTierId: 'f9760f5c-4eb5-4400-b7ed-92763659269c',
        enabled: true,
        maxSpaceBytes: 1099511627776,
        workspaces: {
          enabled: true,
          minimumSeats: 0,
          maximumSeats: 0,
          maxSpaceBytesPerSeat: 1099511627776,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
        featureId: 'cd4f81a4-6c51-4991-b24f-7219dfbbadfd',
      },
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: true,
      },
      darkMonitor: {
        enabled: true,
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
        foreignTierId: '47d76ff1-a6df-4334-a300-b11f50ea6bfd',
        maxSpaceBytes: 1099511627776,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: false,
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
      cleaner: {
        enabled: false,
      },
      cli: {
        enabled: false,
      },
      darkMonitor: {
        enabled: false,
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
        foreignTierId: '899e07f7-0e8c-427b-9613-dee0c5c705a7',
        enabled: true,
        maxSpaceBytes: 3298534883328,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
        featureId: '6d06f11b-9854-49db-a38b-56ca4aab1658',
      },
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: false,
      },
      darkMonitor: {
        enabled: true,
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
        foreignTierId: '23bd8f2c-ae81-4f18-b18a-55a36e66547d',
        enabled: true,
        maxSpaceBytes: 5497558138880,
        workspaces: {
          enabled: false,
          minimumSeats: 0,
          maximumSeats: 0,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: true,
      },
      darkMonitor: {
        enabled: true,
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
        foreignTierId: '746b5656-fe1a-47a1-9547-ee410c4010e8',
        enabled: true,
        maxSpaceBytes: 2199023255552,
        workspaces: {
          enabled: true,
          minimumSeats: 0,
          maximumSeats: 0,
          maxSpaceBytesPerSeat: 2199023255552,
        },
        passwordProtectedSharing: {
          enabled: true,
        },
        restrictedItemsSharing: {
          enabled: true,
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
      cleaner: {
        enabled: true,
      },
      cli: {
        enabled: true,
      },
      darkMonitor: {
        enabled: true,
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
