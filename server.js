import express from 'express';
import 'colors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import authRoutes from './routes/authRoute.js';


// config dotenv
dotenv.config();

import connectDB from './config/db.js';
connectDB();


// REST object
const app = express();



// middleware
app.use(morgan('dev'));
app.use(express.json());

//routes
app.use('/api/v1/auth', authRoutes);



// REST API
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// PORT
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(
    `Server is running in ${process.env.DEV_MODE} mode on port ${PORT}`.bgCyan.white
  );
});
