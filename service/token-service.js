const jwt = require('jsonwebtoken');
const Database = require('../db');


class TokenService extends Database {
    generateTokens(payload) {
        const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
            expiresIn: '60m'
        });

        const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
            expiresIn: '30d'
        });


        return {
            accessToken,
            refreshToken,
        }
    }

    validateAccessToken(token) {
        try {
            const userData = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            return userData;
        } catch (e) {
            return null;
        }
    }

    async validateRefreshToken(token) {
        try {
            const userData = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
            return userData;
        } catch (e) {
            return null;
        }
    }

    async removeToken(refreshToken) {
        await this.query('UPDATE users SET refresh_token = "" WHERE refresh_token = ?', refreshToken);
        return true;
    }

    async saveToken(userId, refreshToken) {
        await this.query('UPDATE users SET refresh_token = ? WHERE id = ? ', refreshToken, userId);
        return refreshToken;
    }
}

module.exports = new TokenService();