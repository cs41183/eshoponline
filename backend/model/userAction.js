// models/userAction.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/Database');

const UserAction = sequelize.define('UserAction', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
});

module.exports = UserAction;
