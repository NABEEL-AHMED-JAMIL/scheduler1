const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = {
    entry: './src/main.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash].js',
        chunkFilename: '[name].[contenthash].js',
        publicPath: '/scheduler/'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            '@': path.resolve(__dirname, 'src/app/'),
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: ['ts-loader', 'angular2-template-loader']
            },
            {
                test: /\.html$/,
                use: 'html-loader'
            },
            {
                test: /\.less$/,
                use: ['style-loader', 'css-loader', 'less-loader']
            },
            {
                // Removed postcss-loader — not in package.json
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            // workaround for warning: System.import() is deprecated
            {
                test: /[\/\\]@angular[\/\\].+\.js$/,
                parser: { system: true }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({ template: './src/index.html' }),

        // Copy static assets to dist/ so they are served correctly
        new CopyWebpackPlugin([
            {
                from: path.resolve(__dirname, 'src/assets'),
                to: 'assets'
            }
        ]),

        new webpack.DefinePlugin({
            config: `{
                sessionId: '0hw0dz34',
                transactionId: '40ef-dd1d-bd9f-1d7f',
                apiUrl: (window.location.protocol + '//' + window.location.hostname + ':9098/api/v1'),
                webSocketUrl: (window.location.protocol + '//' + window.location.hostname + ':9098/api/v1/ws')
            }`
        }),

        // workaround for warning: Critical dependency
        new webpack.ContextReplacementPlugin(
            /\@angular(\\|\/)core(\\|\/)fesm5/,
            path.resolve(__dirname, 'src')
        )
    ],
    optimization: {
        splitChunks: {
            chunks: 'all',
        },
        runtimeChunk: true
    },
    devServer: {
        publicPath: '/scheduler/',
        historyApiFallback: true
    }
}
