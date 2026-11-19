const express = require("express");
const backendApp = require("./backend/server");

const app = express();
app.use(backendApp);

module.exports = app;
