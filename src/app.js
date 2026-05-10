const express = require('express');
const path = require('path');

const healthRouter = require('./routes/health');
const homeRouter = require('./routes/home');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.use('/health', healthRouter);
app.use('/', homeRouter);

module.exports = app;
