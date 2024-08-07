require("./service/search-service");
const express = require("express");
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const router = require('./routes');
const errorMiddleware = require('./middlewares/error-middleware');
const app = express()
const PORT = process.env.PORT ?? 9999;

app.use(bodyParser.json());
app.use(express.json());
app.use(cors({
  credentials: true,
}));
app.use(cookieParser());
app.use('/api', router);
app.use(errorMiddleware);

async function startServer(port) {
  try {
    app.listen(port, () => console.log(`Server started on PORT ${port}`));
  } catch (e) {
    throw new Error(e);
  }
}

startServer(PORT);
