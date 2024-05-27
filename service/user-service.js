const Database = require('../db');
const bcrypt = require('bcrypt');
const uuid = require('uuid');
const mailService = require('./mail-service');  
const tokenService = require('./token-service');
const UserDto = require('../dtos/user-dtos');
const ApiError = require('../exceptions/api-error');
const fs = require('fs');
const { getFile } = require('./file-service');
const path = require('path');

class UserService extends Database {
    async registration(email, password, name, surname) {
        const res = await this.query('SELECT * FROM user WHERE email = ?', email);
        if (res.length !== 0) {
            throw ApiError.BadRequest(`Пользователь с email ${email} уже существует`)
        }

        const hashPassword = await bcrypt.hash(password, 3);
        const activationLink = uuid.v4();

        console.log(uuid);
        await this.query(
            'INSERT INTO user (email, password, activationLink, name, surname, isActivated) VALUES (?, ?, ?, ?, ?, false)', 
            email, hashPassword, activationLink, name, surname
        );
        const [user] = await this.query('SELECT * FROM user WHERE email = ?', email);
        await mailService.sendActivationMail(email, `${process.env.API_URL}/api/auth/activate/${activationLink}`);

        const userDto = new UserDto(user);
        const tokens = tokenService.generateTokens({...userDto});
        await tokenService.saveToken(userDto.id, tokens.refreshToken);

        return {...tokens,user: userDto}
    }

    async login(email, password) {
        const res = await this.query('SELECT * FROM user WHERE email = ?', email);

        if (res.length === 0) {
            throw ApiError.BadRequest(`Пользователя с почтой ${email} не существует`);
        }
        const isPasswordEqual = await bcrypt.compare(password, res[0].password);
        if (!isPasswordEqual) {
            throw ApiError.BadRequest(`Неправльный пароль`);
        }

        const userDto = new UserDto(res[0]);
        const tokens = tokenService.generateTokens({...userDto});

        await tokenService.saveToken(userDto.id, tokens.refreshToken);
        return {...tokens,user: userDto}
    }

    async logout(refreshToken) {
        const token = await tokenService.removeToken(refreshToken);
        return token;
    }

    async activate(activateLink) {
        await this.query('UPDATE user SET isActivated = 1 WHERE activationLink = ?', activateLink);
        return true;
    }

    async refresh(refreshToken) {
        if (!refreshToken) {
            throw ApiError.UnauthorizedError();
        }
        const tokenIsValidate = tokenService.validateRefreshToken(refreshToken);
        const user = await tokenService.findToken(refreshToken);
        if (!tokenIsValidate || !user) {
            throw ApiError.UnauthorizedError();
        }

        const userDto = new UserDto(user);
        const tokens = tokenService.generateTokens({...userDto});

        await tokenService.saveToken(userDto.id, tokens.refreshToken);
        return {...tokens,user: userDto}
    }

    async getAllUsers() {
        return await this.query('SELECT * FROM user');
    }

    // Create the @getUser method for recieving a user from the db
    async getUserByParam(userField, method) {
        console.log('start')
        const getUserQuery = `SELECT * FROM user WHERE ${method} = ?`
        const [userData] = await this.query(getUserQuery, userField);
        return userData;
    }
    async setUserParamById(userField, method, id) {
        const getUserQuery = `UPDATE user SET ${method} = ? WHERE id = ? `
        const userData = await this.query(getUserQuery, userField, id);
        return userData;
    }
    async getUserByAccessToken(token) {
        const {id} = tokenService.validateAccessToken(token);
        const user = await this.getUserByParam(id, 'id');
        return user;
    }
    async editProfile(data) {
        const dataEntries = Object.entries(data);
        let query = 'UPDATE user SET'
        if (dataEntries.length <= 0) {
            return true;
        }

        dataEntries.forEach(([method, property], index) => {
            query += ` ${method} = '${property}'`;
            if (index !== dataEntries.length - 1) {
                query += ','
            }
        });
        query += ' WHERE id = ?'

        await this.query(query, data.id);
        return true;
    }

    // Change a user's data by take @method param 
    // to point out the changing field and the
    // @newData param, which will update a current user's data
    async changeUserData(token, method, newData) {
        // Validate the user by the validating method for accessing they data
        const user = tokenService.validateAccessToken(token)
        if (user.err) throw new Error('While changeing user data happened an error');
        const changeUserMailQuery = `UPDATE user SET ${method} = ? WHERE name = ?`
        const changeUserMailQueryData = [newData, user.name]

        const res = await this.query(changeUserMailQuery, changeUserMailQueryData)
    }
}

module.exports = new UserService();