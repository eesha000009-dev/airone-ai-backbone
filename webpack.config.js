const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  entry: './src/renderer/src/index.jsx',
  output: {
    path: path.resolve(__dirname, 'src/renderer/dist'),
    filename: 'renderer.[contenthash].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new (require('html-webpack-plugin'))({
      template: './src/renderer/index.html',
      inject: true
    }),
    new (require('mini-css-extract-plugin'))({
      filename: 'styles.[contenthash].css'
    })
  ],
  devServer: {
    port: 9000,
    hot: true,
    static: {
      directory: path.join(__dirname, 'src/renderer/dist')
    }
  }
};
