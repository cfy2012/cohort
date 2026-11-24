<?php
/**
 * php -S 的路由脚本。
 * 静态文件交给内置服务器直出，其余全部进前端控制器 index.php。
 */

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// 真实存在的静态资源 + 非 php 文件 => 交给内置服务器
if ($path !== '/' && preg_match('#\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|json|html)$#i', $path)) {
    $file = __DIR__ . $path;
    if (is_file($file) && strpos($file, __DIR__) === 0) {
        return false;
    }
}

require __DIR__ . '/index.php';
