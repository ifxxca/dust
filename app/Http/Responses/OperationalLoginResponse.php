<?php

namespace App\Http\Responses;

use Laravel\Fortify\Http\Responses\LoginResponse;
use Symfony\Component\HttpFoundation\Response;

class OperationalLoginResponse extends LoginResponse
{
    public function toResponse(mixed $request): Response
    {
        return $request->wantsJson()
            ? response()->json(['data' => $request->user()->only(['id', 'name', 'role', 'is_active']), 'meta' => new \stdClass])
            : parent::toResponse($request);
    }
}
