module.exports = class ApiError extends Error {
    status;
    errors;

    constructor(status, message,  errors = []) {
        super(message);

        this.status = status;
        this.errors = errors;
    }

    static UnauthorizedError() {
        return new ApiError(401, 'Пользователь не авторизован');
    }

    static UnAccessedError() {
        return new ApiError(406, 'Недостаточно прав')
    }
    
    static BadRequest(message, errors = []) {
        return new ApiError(500, message, errors);
    }
}