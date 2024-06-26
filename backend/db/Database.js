const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');
const colors = require('colors');

//Konektimi me MongoDB
const connectMongoDB = () => {
    mongoose.connect(process.env.MONGODB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }).then((data) => {
        console.log(`Lidhja me MongoDB eshte kryer me sukses: ${data.connection.host}`.green.bold);
    }).catch((error) => {
        console.log(`Lidhje me MongoDB deshtoi: ${error.message}`)
    });
};


// Konektimi me MySQL
const sequelize = new Sequelize(process.env.MYSQL_DB, process.env.MYSQL_USER, process.env.MYSQL_PASSWORD, {
    host: process.env.MYSQL_HOST,
    dialect: 'mysql',
    logging: console.log
});

const connectMySQL = async () => {
    try{
        await sequelize.authenticate();
        console.log('Lidhja me MySQL eshte kryer me sukses'.blue.bold);
    } catch(error){
        console.error('Lidhja me MySQL deshtoi:'.red, error)
    }
}

//Funksioni me i konektu te dy databazat pernjeher
const connectDatabases = () => {
    connectMongoDB();
    connectMySQL();
}

module.exports = { connectDatabases, sequelize};