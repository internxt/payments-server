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
