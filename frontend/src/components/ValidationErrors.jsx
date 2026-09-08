export function ValidationErrors({ errors = [] }) {
    if (!errors.length) return null;
    return (
        <div
            role="alert"
            className="mb-6 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger"
        >
            <p className="font-semibold mb-2">Complete these fields to continue</p>
            <ul className="list-disc pl-5 space-y-1">
                {errors.map((error, index) => (
                    <li key={`${error.field}-${index}`}>
                        <button
                            type="button"
                            className="text-left underline"
                            onClick={() => document.getElementById(error.field)?.focus()}
                        >
                            {error.message}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
