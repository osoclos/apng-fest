const { EPSILON } = Number;

export function floatToFrac(float: number): number[] {
    const int = Math.floor(float);
    float %= 1;

    if (float < EPSILON) return [int, 1]; 
    if (float > 1 - EPSILON) return [int + 1, 1];

    let lowerNum: number = 0;
    let lowerDen: number = 1;

    let higherNum: number = 1;
    let higherDen: number = 1;

    while (true) {
        const sumNum = lowerNum + higherNum;
        const sumDen = lowerDen + higherDen;

        switch (true) {
            case sumDen * (float + EPSILON) < sumNum: {
                higherNum = sumNum;
                higherDen = sumDen;
                
                break;
            }

            case sumDen * (float - EPSILON) > sumNum: {
                lowerNum = sumNum;
                lowerDen = sumDen;

                break;
            }

            default: return [int * sumDen + sumNum, sumDen];
        }
    }
}