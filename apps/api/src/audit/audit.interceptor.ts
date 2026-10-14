import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';


}

}

/**
 */
@Injectable()

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
        const status = err instanceof HttpException ? err.getStatus() : 500;
      }),
    );
  }
}
