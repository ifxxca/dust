<?php

use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Inertia\ExceptionResponse;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            EnsureActiveUser::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->respond(function (Response $response, Throwable $exception, Request $request): Response {
            if ($response->getStatusCode() === 404
                && in_array($request->method(), ['GET', 'HEAD'], true)
                && ! $request->is('api/*')
                && ! $request->expectsJson()) {
                return (new ExceptionResponse($exception, $request, $response, app(Router::class), app(Kernel::class)))
                    ->render('errors/not-found')
                    ->withSharedData()
                    ->toResponse($request);
            }

            if (! (request()->is('api/*') || (request()->routeIs('login.store', 'logout') && request()->expectsJson())) || $response->getStatusCode() < 400) {
                return $response;
            }
            $status = $response->getStatusCode();
            $body = json_decode($response->getContent() ?: '{}', true) ?: [];
            $message = $status >= 500 ? 'Terjadi kesalahan server. Silakan muat ulang sebelum mencoba kembali.' : ($body['message'] ?? 'Permintaan gagal.');
            $code = match ($status) {
                401 => 'UNAUTHENTICATED', 403 => 'FORBIDDEN', 404 => 'NOT_FOUND',
                409 => str_contains($message, ':') ? explode(':', $message, 2)[0] : 'STATE_CONFLICT',
                419 => 'CSRF_TOKEN_MISMATCH', 422 => 'VALIDATION_FAILED', 429 => 'RATE_LIMITED', default => 'INTERNAL_ERROR',
            };

            return response()->json(['message' => $message, 'code' => $code, 'errors' => $body['errors'] ?? new stdClass, 'meta' => new stdClass], $status);
        });
    })->create();
