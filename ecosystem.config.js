module.exports = {
    apps: [
      {
        name: "InfinityCageX",
        script: "app.js", 
        env: {
          DB_HOST: "localhost",
          DB_USER: "root",
          DB_PASSWORD: "",
          DB_NAME: "infinitycage",
          DB_PORT: 3306,
          REDIS_HOST: "127.0.0.1",
          REDIS_PORT: 6379,
          SESSION_SECRET: "your_secret_key",
          PORT: 4005
        }
      }
    ]
  };
  