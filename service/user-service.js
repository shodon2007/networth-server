const Database = require('../db');
const bcrypt = require('bcrypt');
const uuid = require('uuid');
const mailService = require('./mail-service');
const tokenService = require('./token-service');
const UserDto = require('../dtos/user-dtos');
const ApiError = require('../exceptions/api-error');
const { deleteUser } = require('../controllers/user-controller');
const searchService = require('./search-service');

class UserService extends Database {
    async checkEmailIsEntry(email) {
        const res = await this.query('SELECT * FROM users WHERE email = ?', email);
        return res;
    }
    async registration(email, password, name, surname) {
        const res = await this.checkEmailIsEntry(email);
        if (res.length !== 0) {
            throw ApiError.BadRequest(`Пользователь с email ${email} уже существует`)
        }
        const hashPassword = await bcrypt.hash(password, 3);
        const activationLink = uuid.v4();

        await this.query(
            'INSERT INTO users (email, password, activationLink, name, surname, isActivated, privacy, avatar) VALUES (?, ?, ?, ?, ?, false, "public", "default.png")',
            email, hashPassword, activationLink, name, surname
        );
        searchService.updateUserDocuments();
        const [user] = await this.query('SELECT * FROM users WHERE email = ?', email);
        await mailService.sendActivationMail(email, `${process.env.API_URL}/api/auth/activate/${activationLink}`);

        const userDto = new UserDto(user);
        const tokens = tokenService.generateTokens({ ...userDto });
        await tokenService.saveToken(userDto.id, tokens.refreshToken);

        return { ...tokens, user: userDto }
    }

    async login(email, password) {
        const userData = await this.query(`
        SELECT 
            email, name, surname, id, isActivated, avatar, password
        FROM 
            users
        WHERE 
            email = ?
        `, email);

        if (userData.length === 0) {
            throw ApiError.BadRequest(`login.mailNotFoundMessage`);
        }
        const isPasswordEqual = await bcrypt.compare(password, userData[0].password);
        if (!isPasswordEqual) {
            throw ApiError.BadRequest('login.wrongPasswordMessage');
        }

        const userDto = new UserDto(userData[0]);
        const tokens = tokenService.generateTokens({ ...userDto });

        await tokenService.saveToken(userDto.id, tokens.refreshToken);
        return { ...tokens, user: userDto }
    }
    async changePassword(userId, oldPassword, newPassword) {
        const res = await this.query(`
        SELECT 
            email, name, surname, id, isActivated, avatar , password
        FROM 
            users
        WHERE 
            id = ?
        `, userId);
        const isPasswordEqual = await bcrypt.compare(oldPassword, res[0].password);
        if (!isPasswordEqual) {
            throw new ApiError(400, `login.wrongPasswordMessage`);
        }
        const hashPassword = await bcrypt.hash(newPassword, 3);

        await this.setUserParamById(hashPassword, 'password', userId);
        return true;
    }

    async logout(refreshToken) {
        const token = await tokenService.removeToken(refreshToken);
        return token;
    }

    async activate(activateLink) {
        const activateQuery = 'UPDATE users SET isActivated = 1 WHERE activationLink = ?'
        await this.query(activateQuery, activateLink);
        return true;
    }

    async refresh(refreshToken) {
        if (!refreshToken) {
            throw ApiError.UnauthorizedError();
        }
        const tokenIsValidate = await tokenService.validateRefreshToken(refreshToken);
        if (!tokenIsValidate) {
            throw ApiError.UnauthorizedError();
        }
        const user = await this.getUserByParam(tokenIsValidate.id, "id")
        const userDto = new UserDto(user);
        const tokens = tokenService.generateTokens({ ...userDto });

        await tokenService.saveToken(userDto.id, tokens.refreshToken);
        return { ...tokens, user: userDto }
    }
    // Retrieve all users from the database
    async getAllUsers() {
        return await this.query('SELECT * FROM users');
    }

    // Create the @getUser method for recieving a user from the db
    async getUserByParam(userField, method) {
        const getUserQuery = `SELECT * FROM users WHERE ${method} = ?`
        const [userData] = await this.query(getUserQuery, userField);
        return userData;
    }

    // Update a user's database column info by provide the 
    // user's parameter to its change and the new value
    async setUserParamById(fieldValue, method, id) {
        const getUserQuery = `UPDATE users SET ? = ? WHERE id = ? `
        searchService.updateUserDocuments();
        const userData = await this.query(getUserQuery, method, fieldValue, id);
        return userData;
    }
    // Retrieve the user from the database by an access token 
    async getUserByAccessToken(token) {
        const { id } = tokenService.validateAccessToken(token);
        const user = await this.getUserByParam(id, 'id');
        return new UserDto(user);
    }

    async deleteUser(id) {
        try {
            await this.query("DELETE FROM users WHERE id = ?", id);
            searchService.updateUserDocuments();
            return true;
        } catch {
            return false;
        }
    }
    // Update a full user info 
    async editProfile(data) {
        let query = 'UPDATE users SET name = ?, surname = ? WHERE id = ?'

        await this.query(query, data.name, data.surname, data.id);
        searchService.updateUserDocuments();
        return true;
    }

    // Change a user's data by take @method param to point out the changing field 
    // and the @newData param, which will update a current user's data
    async changeUserData(token, method, newData) {
        // Validate the user by the validating method for accessing they data
        const user = tokenService.validateAccessToken(token)
        if (user.err) throw ApiError('While changeing users data happened an error');
        const changeUserMailQuery = `UPDATE users SET ? = ? WHERE name = ?`
        const changeUserMailQueryData = [method, newData, user.name]

        const res = await this.query(changeUserMailQuery, changeUserMailQueryData)
        searchService.updateUserDocuments();
        return res;
    }
}

module.exports = new UserService();