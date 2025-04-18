const accountController = require('./AccountController');
const loginController = require('./LoginController');
const fileController = require('./FileController');
const shopController = require('./ShopController');
const emailController = require('./EmailController');
const permanentlyBannedAccountController = require('./PermanentlyBannedAccountController');

module.exports = {
    accountController,
    loginController,
    fileController,
    shopController,
    emailController,
    permanentlyBannedAccountController
}; 